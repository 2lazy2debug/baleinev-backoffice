#!/usr/bin/env python3
"""Summarise a Chrome DevTools performance trace of typing into the journal.

Usage: python3 docs/soa/analyze-trace.py <trace.json | trace.json.gz | trace.gz>

Reads the renderer's main thread only and prints the numbers plan 114 uses to
judge the bulk-edit keystroke cost:

  - how many keystrokes (`input` events) the trace holds, and how long each
    one's handler blocked the main thread (median / p95 / max)
  - total time in React's work loop (the minified `performSyncWorkOnRoot` chain
    is not named in a prod build, so this is the FunctionCall time under input
    handlers — close enough to compare two traces of the same build shape)
  - Paint / HitTest medians and the page's layout-object count (DOM weight)

Standard library only — no venv needed.
"""
import gzip
import json
import statistics
import sys


def load(path):
    opener = gzip.open if path.endswith(".gz") else open
    with opener(path, "rt") as f:
        data = json.load(f)
    return data["traceEvents"] if isinstance(data, dict) else data


def renderer_main(events):
    """(pid, tid) of the busiest CrRendererMain thread — the page being traced."""
    names = {(e["pid"], e["tid"]): e["args"]["name"] for e in events if e.get("name") == "thread_name"}
    counts = {}
    for e in events:
        key = (e.get("pid"), e.get("tid"))
        if names.get(key) == "CrRendererMain":
            counts[key] = counts.get(key, 0) + 1
    return max(counts, key=counts.get)


def ms(us):
    return round(us / 1000, 1)


def summary(label, values):
    if not values:
        return f"{label}: none"
    values = sorted(values)
    p95 = values[min(len(values) - 1, int(len(values) * 0.95))]
    return (
        f"{label}: n={len(values)} median={ms(statistics.median(values))}ms "
        f"p95={ms(p95)}ms max={ms(values[-1])}ms total={ms(sum(values))}ms"
    )


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    events = load(sys.argv[1])
    pid, tid = renderer_main(events)
    main_thread = [e for e in events if e.get("pid") == pid and e.get("tid") == tid and "dur" in e]

    def by_name(name):
        return [e for e in main_thread if e["name"] == name]

    def dispatch(kind):
        return [e["dur"] for e in by_name("EventDispatch") if e["args"].get("data", {}).get("type") == kind]

    print(summary("input handler (per keystroke)", dispatch("input")))
    print(summary("keydown handler", dispatch("keydown")))
    print(summary("FunctionCall (all JS entry points)", [e["dur"] for e in by_name("FunctionCall")]))
    print(summary("Paint", [e["dur"] for e in by_name("Paint")]))
    print(summary("HitTest", [e["dur"] for e in by_name("HitTest")]))
    print(summary("Layout", [e["dur"] for e in by_name("Layout")]))

    objects = [e["args"]["beginData"].get("totalObjects") for e in by_name("Layout") if "beginData" in e["args"]]
    objects = [o for o in objects if o]
    print(f"layout objects on page: {max(objects) if objects else 'unknown'}")

    long_tasks = [e["dur"] for e in by_name("RunTask") if e["dur"] > 50_000]
    print(summary("long tasks (>50ms)", long_tasks))


if __name__ == "__main__":
    main()
