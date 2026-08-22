#!/usr/bin/env python3
"""
ShopGuard Bill-Print Monitor
============================

Watches your Windows print queue for the bill printer and alerts you the
moment a bill fails to print — a job errors out, gets stuck, or the printer
itself is offline / out of paper.

This works with ANY billing software (Tally, Marg, Busy, a custom POS, even
a spreadsheet) because it does NOT hook into the billing software at all —
it watches the Windows print queue that software's "Print" button sends to.
Whatever creates the bill, once it hits "Print", this script sees it.

Requires: Windows + pywin32
    pip install pywin32

Usage:
    python print_monitor.py --config print_config.yaml
"""
import argparse
import sys
import time

import requests
import yaml


def log(msg):
    print(f"{time.strftime('%H:%M:%S')} {msg}", flush=True)


# Windows print job / printer status bit flags that mean "something is wrong"
# (see win32print / JOB_STATUS_* and PRINTER_STATUS_* in the Win32 API docs)
_ERROR_FLAGS = {
    0x00000002: "error",
    0x00000010: "offline",
    0x00000020: "paper_out",
    0x00000040: "printing",       # informational, not an error on its own
    0x00000400: "user_intervention_needed",
    0x00000800: "out_of_memory",
    0x00002000: "blocked",
    0x00400000: "door_open",
    0x00800000: "server_unknown",
    0x01000000: "power_save",
}
_IGNORE_FLAGS = {0x00000040, 0x01000000}  # not failures — don't alert on these alone


def _describe(status_bits):
    return [label for bit, label in _ERROR_FLAGS.items()
            if (status_bits & bit) and bit not in _IGNORE_FLAGS]


def send_alert(cfg, printer_name, document, reason):
    try:
        r = requests.post(
            cfg["cloud_url"].rstrip("/") + "/api/print/alert",
            json={"printer_name": printer_name, "document": document, "reason": reason},
            headers={"X-Agent-Key": cfg["agent_key"]},
            timeout=10,
        )
        if r.status_code == 401:
            log("ALERT REJECTED — agent_key does not match dashboard")
            return
        r.raise_for_status()
        log(f"ALERT sent: {reason}" + (f" — {document}" if document else ""))
    except Exception as e:
        log(f"alert send failed: {e}")


def main():
    ap = argparse.ArgumentParser(description="ShopGuard Bill-Print Monitor")
    ap.add_argument("--config", default="print_config.yaml", help="path to print_config.yaml")
    args = ap.parse_args()

    if sys.platform != "win32":
        log("FATAL: this monitor uses the Windows print spooler API and only runs on Windows.")
        sys.exit(1)

    with open(args.config) as f:
        cfg = yaml.safe_load(f)

    for required in ("cloud_url", "agent_key", "printer_name"):
        if not cfg.get(required):
            log(f"FATAL: '{required}' missing in {args.config}")
            sys.exit(1)
    if cfg["agent_key"] in ("CHANGE_ME", "", None):
        log("FATAL: set 'agent_key' in print_config.yaml (copy it from the dashboard).")
        sys.exit(1)

    import win32print

    printer_name  = cfg["printer_name"]
    poll_interval = float(cfg.get("poll_interval", 5))
    stuck_after   = float(cfg.get("stuck_after_seconds", 45))
    offline_cool  = float(cfg.get("offline_alert_cooldown", 600))

    try:
        available = [p[2] for p in win32print.EnumPrinters(win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS)]
    except Exception:
        available = []
    if available and printer_name not in available:
        log(f"WARNING: '{printer_name}' not found. Available printers: {', '.join(available)}")

    alerted_jobs        = set()
    job_first_seen      = {}
    last_offline_alert  = 0.0

    log(f"Watching printer '{printer_name}' — checking every {poll_interval}s")

    while True:
        try:
            h = win32print.OpenPrinter(printer_name)
            try:
                info = win32print.GetPrinter(h, 2)
                printer_status = info["Status"]
                jobs = win32print.EnumJobs(h, 0, -1, 1)
            finally:
                win32print.ClosePrinter(h)

            # Whole-printer problem (offline / out of paper / door open …)
            reasons = _describe(printer_status)
            if reasons:
                if time.time() - last_offline_alert > offline_cool:
                    send_alert(cfg, printer_name, "", "+".join(reasons))
                    last_offline_alert = time.time()
            else:
                last_offline_alert = 0.0  # healthy again — next issue alerts immediately

            seen_now = set()
            for job in jobs:
                jid = job["JobId"]
                seen_now.add(jid)
                job_reasons = _describe(job["Status"])
                doc = job.get("pDocument") or "bill"

                job_first_seen.setdefault(jid, time.time())
                stuck = (time.time() - job_first_seen[jid]) > stuck_after

                if (job_reasons or stuck) and jid not in alerted_jobs:
                    reason = "+".join(job_reasons) if job_reasons else "stuck_in_queue"
                    send_alert(cfg, printer_name, doc, reason)
                    alerted_jobs.add(jid)

            # Stop tracking jobs that finished (left the queue) so IDs don't leak forever
            for jid in list(job_first_seen):
                if jid not in seen_now:
                    job_first_seen.pop(jid, None)
                    alerted_jobs.discard(jid)

        except Exception as e:
            log(f"monitor error: {e}")

        time.sleep(poll_interval)


if __name__ == "__main__":
    main()
