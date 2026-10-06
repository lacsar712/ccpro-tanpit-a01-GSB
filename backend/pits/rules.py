"""鞣坑放液门槛：须挂现行工牌且姓名对得上，最近一次浸液酸碱度须在 3.5～5.0。"""

from pits.models import Badge, Pit, User

MIN_PH = 3.5
MAX_PH = 5.0


class RuleError(ValueError):
    pass


def latest_ph(pit: Pit) -> float | None:
    sample = pit.samples.order_by("-taken_at", "-id").first()
    return None if sample is None else sample.ph


def current_badge(pit: Pit) -> Badge | None:
    """坑的现行（未摘）工牌；没有则为 None。只读，不改写任何数据。"""
    badges = pit.badges.all()  # 走 prefetch 缓存时不额外查库
    return next((b for b in badges if b.removed_at is None), None)


def assert_can_set_status(pit: Pit, new_status: str, user: User) -> None:
    allowed = {Pit.STATUS_FILL, Pit.STATUS_TANNING, Pit.STATUS_DRAINED}
    if new_status not in allowed:
        raise RuleError(f"无效状态：{new_status}")
    if new_status != Pit.STATUS_DRAINED:
        return
    badge = current_badge(pit)
    if badge is None:
        raise RuleError("该坑未挂现行工牌，不能放液")
    if badge.holder_name != user.username:
        raise RuleError(f"现行工牌姓名「{badge.holder_name}」与当前登录人「{user.username}」不符，不能放液")
    ph = latest_ph(pit)
    if ph is None:
        raise RuleError("该坑尚无浸液酸碱记录，不能放液")
    if ph < MIN_PH or ph > MAX_PH:
        raise RuleError(f"最近酸碱度 {ph} 不在 {MIN_PH}～{MAX_PH}，不能放液")
