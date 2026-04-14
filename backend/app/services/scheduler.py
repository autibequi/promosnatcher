import asyncio
import logging
import pytz
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger(__name__)

_UTC = pytz.utc
_scheduler = BackgroundScheduler(timezone=_UTC)
_interval_minutes = 30


def _make_trigger(minutes: int) -> IntervalTrigger:
    return IntervalTrigger(minutes=minutes, timezone=_UTC)


def _run_scan():
    from .scanner import scan_all_groups
    asyncio.run(scan_all_groups())


def start(interval_minutes: int = 30):
    global _interval_minutes
    _interval_minutes = interval_minutes
    if _scheduler.running:
        return
    _scheduler.add_job(
        _run_scan,
        trigger=_make_trigger(interval_minutes),
        id="scan_all",
        replace_existing=True,
    )
    _scheduler.start()
    logger.info(f"Scheduler started — interval {interval_minutes}min")


def restart(interval_minutes: int):
    global _interval_minutes
    _interval_minutes = interval_minutes
    if _scheduler.running:
        _scheduler.remove_all_jobs()
        _scheduler.add_job(
            _run_scan,
            trigger=_make_trigger(interval_minutes),
            id="scan_all",
            replace_existing=True,
        )
    else:
        start(interval_minutes)
    logger.info(f"Scheduler restarted — interval {interval_minutes}min")


def stop():
    if _scheduler.running:
        _scheduler.shutdown(wait=False)


def status() -> dict:
    if not _scheduler.running:
        return {"running": False, "next_run": None, "interval_minutes": _interval_minutes}
    job = _scheduler.get_job("scan_all")
    next_run = job.next_run_time.isoformat() if job and job.next_run_time else None
    return {
        "running": True,
        "next_run": next_run,
        "interval_minutes": _interval_minutes,
    }
