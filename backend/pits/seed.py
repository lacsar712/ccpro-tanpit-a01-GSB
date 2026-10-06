from django.utils import timezone

from pits.models import LiquorSample, Pit, User, WorkBadge, Yard


def seed_demo() -> None:
    admin, _ = User.objects.get_or_create(username="admin", defaults={"role": "admin"})
    admin.role = "admin"
    admin.set_password("123456")
    admin.save()
    worker, _ = User.objects.get_or_create(username="worker", defaults={"role": "worker"})
    worker.role = "worker"
    worker.set_password("123456")
    worker.save()
    if Yard.objects.exists():
        return
    yard = Yard.objects.create(name="南冈鞣场", village="青皮村")
    layout = [
        ("东-1", Pit.STATUS_TANNING, 0, 0, 4.2),
        ("东-2", Pit.STATUS_FILL, 0, 1, None),
        ("中-1", Pit.STATUS_DRAINED, 1, 0, 4.6),
        ("中-2", Pit.STATUS_TANNING, 1, 1, 6.1),
        ("西-1", Pit.STATUS_FILL, 2, 0, None),
        ("西-2", Pit.STATUS_DRAINED, 2, 1, 3.8),
    ]
    pits = {}
    for code, status, row, col, ph in layout:
        pit = Pit.objects.create(yard=yard, code=code, status=status, row=row, col=col)
        pits[code] = pit
        if ph is not None:
            LiquorSample.objects.create(pit=pit, ph=ph, operator="worker")
    WorkBadge.objects.create(pit=pits["东-1"], number=101, worker_name="worker")
    WorkBadge.objects.create(pit=pits["中-2"], number=102, worker_name="admin")
    WorkBadge.objects.create(
        pit=pits["西-2"], number=103, worker_name="worker", removed_at=timezone.now()
    )
