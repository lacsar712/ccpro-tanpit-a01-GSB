from django.db import IntegrityError, transaction
from django.db.models import Prefetch, Q
from django.utils import timezone
from ninja import NinjaAPI, Schema
from ninja.errors import HttpError

from pits.auth import BearerAuth, make_token
from pits.models import Pit, User, WorkBadge, Yard
from pits.rules import RuleError, assert_can_set_status, current_badge, latest_ph

api = NinjaAPI(title="TanPit", urls_namespace="tanpit")
auth = BearerAuth()


class LoginIn(Schema):
    username: str
    password: str


class SampleIn(Schema):
    ph: float


class StatusIn(Schema):
    status: str


class BadgeIn(Schema):
    pit_id: int
    number: int
    worker_name: str


class BadgeEditIn(Schema):
    pit_id: int | None = None
    number: int | None = None
    worker_name: str | None = None


def badge_json(badge: WorkBadge) -> dict:
    return {
        "id": badge.id,
        "pitId": badge.pit_id,
        "pitCode": badge.pit.code,
        "number": badge.number,
        "workerName": badge.worker_name,
        "hungAt": badge.hung_at.isoformat(),
        "removedAt": badge.removed_at.isoformat() if badge.removed_at else None,
        "current": badge.removed_at is None,
    }


def pit_json(pit: Pit) -> dict:
    prefetched = getattr(pit, "current_badges", None)
    if prefetched is not None:
        badge = prefetched[0] if prefetched else None
    else:
        badge = current_badge(pit)
    return {
        "id": pit.id,
        "code": pit.code,
        "status": pit.status,
        "row": pit.row,
        "col": pit.col,
        "latestPh": latest_ph(pit),
        "sampleCount": pit.samples.count(),
        "badge": None if badge is None else badge_json(badge),
    }


def get_pit_or_404(pit_id: int) -> Pit:
    pit = Pit.objects.filter(id=pit_id).first()
    if pit is None:
        raise HttpError(404, "坑不存在")
    return pit


def get_badge_or_404(badge_id: int) -> WorkBadge:
    badge = WorkBadge.objects.select_related("pit").filter(id=badge_id).first()
    if badge is None:
        raise HttpError(404, "工牌不存在")
    return badge


def conflict_message(pit: Pit, number: int) -> str:
    if WorkBadge.objects.filter(pit=pit, removed_at__isnull=True).exists():
        return f"{pit.code} 已有现行工牌，请先摘下再挂"
    if WorkBadge.objects.filter(number=number, removed_at__isnull=True).exists():
        return f"牌号 {number} 已挂在其他坑上"
    return "挂牌冲突，请刷新后重试"


@api.post("/auth/login")
def login(request, payload: LoginIn):
    user = User.objects.filter(username=payload.username).first()
    if user is None or not user.check_password(payload.password):
        raise HttpError(401, "用户名或密码错误")
    return {"access_token": make_token(user.username), "user": {"username": user.username, "role": user.role}}


@api.get("/auth/me", auth=auth)
def me(request):
    user = request.auth
    return {"username": user.username, "role": user.role}


@api.get("/health")
def health(request):
    return {"status": "ok", "service": "TanPit"}


@api.get("/board", auth=auth)
def board(request):
    current = WorkBadge.objects.filter(removed_at__isnull=True).select_related("pit")
    yard = Yard.objects.prefetch_related(
        "pits__samples", Prefetch("pits__badges", queryset=current, to_attr="current_badges")
    ).first()
    if yard is None:
        raise HttpError(404, "尚无鞣场")
    pits = sorted(yard.pits.all(), key=lambda p: (p.row, p.col))
    return {"yard": yard.name, "village": yard.village, "pits": [pit_json(p) for p in pits]}


@api.post("/pits/{pit_id}/samples", auth=auth)
def add_sample(request, pit_id: int, payload: SampleIn):
    pit = get_pit_or_404(pit_id)
    pit.samples.create(ph=payload.ph, operator=request.auth.username)
    pit.refresh_from_db()
    return pit_json(pit)


@api.post("/pits/{pit_id}/status", auth=auth)
def set_status(request, pit_id: int, payload: StatusIn):
    pit = get_pit_or_404(pit_id)
    try:
        assert_can_set_status(pit, payload.status, request.auth)
    except RuleError as exc:
        raise HttpError(400, str(exc))
    pit.status = payload.status
    pit.save(update_fields=["status"])
    return pit_json(pit)


@api.get("/badges", auth=auth)
def list_badges(request, pit_id: int | None = None, status: str = "all", q: str = ""):
    qs = WorkBadge.objects.select_related("pit").order_by("-hung_at", "-id")
    if pit_id is not None:
        qs = qs.filter(pit_id=pit_id)
    if status == "current":
        qs = qs.filter(removed_at__isnull=True)
    elif status == "removed":
        qs = qs.filter(removed_at__isnull=False)
    q = q.strip()
    if q:
        cond = Q(worker_name__icontains=q) | Q(pit__code__icontains=q)
        if q.isdigit():
            cond |= Q(number=int(q))
        qs = qs.filter(cond)
    return [badge_json(b) for b in qs]


@api.post("/badges", auth=auth)
def hang_badge(request, payload: BadgeIn):
    user = request.auth
    if payload.number < 1:
        raise HttpError(400, "牌号须为正整数")
    worker_name = payload.worker_name.strip()
    if not worker_name:
        raise HttpError(400, "姓名不能为空")
    if worker_name != user.username:
        raise HttpError(403, "工牌姓名只能填写本人")
    pit = get_pit_or_404(payload.pit_id)
    try:
        with transaction.atomic():
            badge = WorkBadge.objects.create(pit=pit, number=payload.number, worker_name=worker_name)
    except IntegrityError:
        raise HttpError(409, conflict_message(pit, payload.number))
    return badge_json(badge)


@api.patch("/badges/{badge_id}", auth=auth)
def edit_badge(request, badge_id: int, payload: BadgeEditIn):
    badge = get_badge_or_404(badge_id)
    user = request.auth
    is_admin = user.role == "admin"
    if not is_admin and badge.worker_name != user.username:
        raise HttpError(403, "只有管理员或本人才可编辑工牌")
    if payload.number is not None:
        if payload.number < 1:
            raise HttpError(400, "牌号须为正整数")
        badge.number = payload.number
    if payload.worker_name is not None:
        worker_name = payload.worker_name.strip()
        if not worker_name:
            raise HttpError(400, "姓名不能为空")
        if not is_admin and worker_name != user.username:
            raise HttpError(403, "工牌姓名只能填写本人")
        badge.worker_name = worker_name
    if payload.pit_id is not None:
        badge.pit = get_pit_or_404(payload.pit_id)
    try:
        with transaction.atomic():
            badge.save()
    except IntegrityError:
        raise HttpError(409, conflict_message(badge.pit, badge.number))
    return badge_json(badge)


@api.post("/badges/{badge_id}/remove", auth=auth)
def remove_badge(request, badge_id: int):
    badge = get_badge_or_404(badge_id)
    user = request.auth
    if user.role != "admin" and badge.worker_name != user.username:
        raise HttpError(403, "只有管理员或本人才可摘牌")
    updated = WorkBadge.objects.filter(id=badge.id, removed_at__isnull=True).update(removed_at=timezone.now())
    if not updated:
        raise HttpError(400, "该工牌已摘下")
    badge.refresh_from_db()
    return badge_json(badge)
