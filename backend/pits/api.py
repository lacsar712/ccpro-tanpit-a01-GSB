from django.db import IntegrityError
from django.utils import timezone
from ninja import NinjaAPI, Schema
from ninja.errors import HttpError

from pits.auth import BearerAuth, make_token
from pits.models import Badge, Pit, User, Yard
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


class BadgePatchIn(Schema):
    number: int


def badge_json(badge: Badge) -> dict:
    return {
        "id": badge.id,
        "pitId": badge.pit_id,
        "pitCode": badge.pit.code,
        "number": badge.number,
        "holderName": badge.holder_name,
        "hungAt": badge.hung_at.isoformat(),
        "removedAt": badge.removed_at.isoformat() if badge.removed_at else None,
        "current": badge.removed_at is None,
    }


def pit_json(pit: Pit) -> dict:
    badge = current_badge(pit)
    return {
        "id": pit.id,
        "code": pit.code,
        "status": pit.status,
        "row": pit.row,
        "col": pit.col,
        "latestPh": latest_ph(pit),
        "sampleCount": pit.samples.count(),
        "currentBadge": None if badge is None else badge_json(badge),
    }


def get_pit_or_404(pit_id: int) -> Pit:
    pit = Pit.objects.filter(id=pit_id).first()
    if pit is None:
        raise HttpError(404, "坑不存在")
    return pit


def get_badge_or_404(badge_id: int) -> Badge:
    badge = Badge.objects.select_related("pit").filter(id=badge_id).first()
    if badge is None:
        raise HttpError(404, "工牌不存在")
    return badge


def assert_admin_or_holder(user: User, badge: Badge, action: str) -> None:
    if user.role != "admin" and badge.holder_name != user.username:
        raise HttpError(403, f"只有管理员或本人才可{action}工牌")


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
    yard = Yard.objects.prefetch_related("pits__samples", "pits__badges").first()
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
def list_badges(request, pit_id: int | None = None, current: bool | None = None):
    qs = Badge.objects.select_related("pit").order_by("-hung_at", "-id")
    if pit_id is not None:
        qs = qs.filter(pit_id=pit_id)
    if current is not None:
        qs = qs.filter(removed_at__isnull=current)
    return [badge_json(b) for b in qs]


@api.post("/badges", auth=auth)
def hang_badge(request, payload: BadgeIn):
    if payload.number < 1:
        raise HttpError(400, "牌号须为正整数")
    pit = get_pit_or_404(payload.pit_id)
    try:
        # 姓名只能写成自己；并发抢挂由部分唯一约束兜底，输家报 409
        badge = Badge.objects.create(pit=pit, number=payload.number, holder_name=request.auth.username)
    except IntegrityError:
        raise HttpError(409, "该坑已有现行工牌，挂上失败")
    return badge_json(Badge.objects.select_related("pit").get(id=badge.id))


@api.post("/badges/{badge_id}/remove", auth=auth)
def remove_badge(request, badge_id: int):
    badge = get_badge_or_404(badge_id)
    assert_admin_or_holder(request.auth, badge, "摘下")
    if badge.removed_at is not None:
        raise HttpError(400, "该工牌已摘下")
    badge.removed_at = timezone.now()
    badge.save(update_fields=["removed_at"])
    return badge_json(badge)


@api.patch("/badges/{badge_id}", auth=auth)
def edit_badge(request, badge_id: int, payload: BadgePatchIn):
    badge = get_badge_or_404(badge_id)
    assert_admin_or_holder(request.auth, badge, "编辑")
    if badge.removed_at is not None:
        raise HttpError(400, "该工牌已摘下，不能编辑")
    if payload.number < 1:
        raise HttpError(400, "牌号须为正整数")
    badge.number = payload.number
    badge.save(update_fields=["number"])
    return badge_json(badge)
