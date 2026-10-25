import { useEffect, useState } from "react";
import {
  usePermission,
  useToast,
  useTranslation,
} from "@termix-ssh/plugin-sdk/frontend";
import { Button } from "@termix-ssh/plugin-sdk/ui";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { print, ros, toCallError } from "../api";
import { Field, FormDialog, TextInput } from "../components/forms";

/*
 * WinBox's Safe Mode undoes changes when the session drops. The API has no
 * such session, so this does what admins do by hand: save a backup, and
 * schedule loading it back in a few minutes. Keep changes removes the
 * schedule; a router you can no longer reach rolls itself back.
 */

export const SAFE_BACKUP = "termix-safe";
export const SAFE_SCHEDULER = "termix-safe-rollback";
const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

/** The router's clock plus some minutes, in the router's own date format. */
export function laterOnRouter(
  date: string,
  time: string,
  minutes: number,
): { date: string; time: string } | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const old = /^([a-z]{3})\/(\d{2})\/(\d{4})$/i.exec(date);
  const tm = /^(\d{2}):(\d{2}):(\d{2})$/.exec(time);
  if (!tm || (!iso && !old)) return null;
  const [y, m, d] = iso
    ? [Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])]
    : [Number(old![3]), MONTHS.indexOf(old![1].toLowerCase()), Number(old![2])];
  if (m < 0) return null;
  const at = new Date(
    Date.UTC(y, m, d, Number(tm[1]), Number(tm[2]), Number(tm[3])) +
      minutes * 60000,
  );
  const pad = (n: number) => String(n).padStart(2, "0");
  const outTime = `${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())}:${pad(at.getUTCSeconds())}`;
  const outDate = iso
    ? `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}`
    : `${MONTHS[at.getUTCMonth()]}/${pad(at.getUTCDate())}/${at.getUTCFullYear()}`;
  return { date: outDate, time: outTime };
}

const storageKey = (hostId: number) => `mikrotik.safe.${hostId}`;

function readUntil(hostId: number): number | null {
  try {
    const raw = Number(localStorage.getItem(storageKey(hostId)));
    return raw > 0 ? raw : null;
  } catch {
    return null;
  }
}

function writeUntil(hostId: number, until: number | null) {
  try {
    if (until) localStorage.setItem(storageKey(hostId), String(until));
    else localStorage.removeItem(storageKey(hostId));
  } catch {
    // Storage off: the countdown lasts until the page reloads.
  }
}

async function dropSchedule(hostId: number) {
  const [rows, files] = await Promise.all([
    print(hostId, "system/scheduler", {
      query: { name: SAFE_SCHEDULER },
      proplist: [".id"],
    }),
    print(hostId, "file", {
      query: { name: `${SAFE_BACKUP}.backup` },
      proplist: [".id"],
    }),
  ]);
  if (rows.length) {
    await ros(hostId, "system/scheduler", "remove", {
      numbers: rows.map((r) => r[".id"]).join(","),
    });
  }
  if (files.length) {
    await ros(hostId, "file", "remove", {
      numbers: files.map((r) => r[".id"]).join(","),
    });
  }
}

export function SafeModeButton({ hostId }: { hostId: number }) {
  const { t } = useTranslation();
  const toast = useToast();
  const canAdmin = usePermission("administer");
  const [until, setUntil] = useState<number | null>(() => readUntil(hostId));
  const [now, setNow] = useState(Date.now());
  const [asking, setAsking] = useState(false);
  const [minutes, setMinutes] = useState("5");
  const [busy, setBusy] = useState(false);

  useEffect(() => setUntil(readUntil(hostId)), [hostId]);
  useEffect(() => {
    if (!until) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [until]);

  if (!canAdmin) return null;

  const start = async () => {
    const n = Math.min(60, Math.max(1, Number(minutes) || 5));
    const [clock] = await print(hostId, "system/clock");
    const at = clock ? laterOnRouter(clock.date, clock.time, n) : null;
    if (!at) throw new Error(t("safe.noClock"));
    await dropSchedule(hostId).catch(() => {});
    await ros(hostId, "system/backup", "save", {
      name: SAFE_BACKUP,
      "dont-encrypt": "yes",
    });
    await ros(hostId, "system/scheduler", "add", {
      name: SAFE_SCHEDULER,
      "start-date": at.date,
      "start-time": at.time,
      interval: "0",
      "on-event": `/system scheduler remove [find name="${SAFE_SCHEDULER}"]; /system backup load name=${SAFE_BACKUP}.backup password=""`,
      comment: "Termix: rolls back changes unless confirmed",
    });
    const next = Date.now() + n * 60000;
    writeUntil(hostId, next);
    setUntil(next);
    toast.success(t("safe.started", { minutes: n }));
  };

  const keep = async () => {
    setBusy(true);
    try {
      await dropSchedule(hostId);
      writeUntil(hostId, null);
      setUntil(null);
      toast.success(t("safe.kept"));
    } catch (err) {
      toast.error(toCallError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const rollBack = async () => {
    setBusy(true);
    try {
      await ros(hostId, "system/backup", "load", {
        name: `${SAFE_BACKUP}.backup`,
        password: "",
      });
    } catch (err) {
      const e = toCallError(err);
      if (e.code !== "ROS_UNREACHABLE" && e.code !== "ROS_TIMEOUT")
        toast.error(e.message);
    } finally {
      writeUntil(hostId, null);
      setUntil(null);
      setBusy(false);
      toast.success(t("safe.rolledBack"));
    }
  };

  if (until) {
    const left = Math.max(0, Math.round((until - now) / 1000));
    return (
      <div className="flex items-center gap-1">
        <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
          <ShieldAlert className="size-3.5" />
          {left > 0
            ? t("safe.left", {
                time: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`,
              })
            : t("safe.expired")}
        </span>
        <Button
          size="sm"
          className="h-7"
          disabled={busy}
          onClick={() => void keep()}
        >
          {t("safe.keep")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7"
          disabled={busy}
          onClick={() => void rollBack()}
        >
          {t("safe.rollBack")}
        </Button>
      </div>
    );
  }

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="h-7"
        onClick={() => setAsking(true)}
        title={t("safe.hint")}
      >
        <ShieldCheck className="mr-1 size-3.5" />
        {t("safe.title")}
      </Button>
      {asking && (
        <FormDialog
          title={t("safe.title")}
          submitLabel={t("safe.start")}
          onClose={() => setAsking(false)}
          onSubmit={start}
        >
          <p className="text-xs">{t("safe.description")}</p>
          <Field label={t("safe.minutes")}>
            <TextInput
              type="number"
              min={1}
              max={60}
              value={minutes}
              onChange={setMinutes}
            />
          </Field>
        </FormDialog>
      )}
    </>
  );
}
