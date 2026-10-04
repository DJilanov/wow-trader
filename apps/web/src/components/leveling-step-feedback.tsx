"use client";

import { useRef, useState, type FormEvent } from "react";
import type { CharacterProfile } from "@wow-trader/leveling";
import type { ReadingPosition } from "../lib/leveling-experience";
import {
  feedbackCategories,
  feedbackCategoryLabels,
  levelingFeedbackSchema,
} from "../lib/leveling-feedback";
import styles from "./leveling-experience.module.css";

interface FeedbackProps {
  readonly position: ReadingPosition;
  readonly profile: CharacterProfile;
}
export function LevelingStepFeedback({ position, profile }: FeedbackProps): React.JSX.Element {
  const [category, setCategory] =
    useState<(typeof feedbackCategories)[number]>("confusing-instruction");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const submission = useRef<{ readonly id: string; readonly body: string } | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (status === "sending" || status === "sent") return;
    const body = JSON.stringify({ position, profile, category, message: message.trim() });
    if (submission.current?.body !== body) submission.current = { id: crypto.randomUUID(), body };
    const parsed = levelingFeedbackSchema.safeParse({
      submissionId: submission.current.id,
      position,
      profile,
      category,
      message,
    });
    if (!parsed.success) {
      setStatus("error");
      setNotice("Describe the issue in 10–1,500 characters. Do not include personal information.");
      return;
    }
    setStatus("sending");
    setNotice(null);
    try {
      const response = await fetch("/api/v1/leveling-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok)
        throw new Error(
          response.status === 429
            ? "Too many reports. Wait 30 minutes, then retry."
            : response.status === 422
              ? "This step or release is no longer available. Refresh the guide before reporting."
              : "Report was not confirmed. Your text is retained; please retry later.",
        );
      const result: unknown = await response.json();
      if (
        !result ||
        typeof result !== "object" ||
        !("reportId" in result) ||
        typeof result.reportId !== "string" ||
        !("status" in result) ||
        result.status !== "received"
      )
        throw new Error("Report was not confirmed. Your text is retained; please retry.");
      setStatus("sent");
      setNotice(
        `Report received · ${result.reportId}. It will be reviewed; no route or coordinates were changed automatically.`,
      );
    } catch (error: unknown) {
      setStatus("error");
      setNotice(error instanceof Error ? error.message : "Report was not confirmed. Please retry.");
    }
  }
  return (
    <details
      className={styles.guideDetails}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary>Report a problem with this step</summary>
      {expanded && (
        <form onSubmit={(event) => void submit(event)} className={styles.feedbackForm}>
          <p>
            This sends the chapter, step, guide version/build, and
            faction/race/class/level/pace/party/XP setup. No character name, local ID or completion
            history is included. Do not put personal information in your report.
          </p>
          <label className={styles.field}>
            Problem type
            <select
              value={category}
              disabled={status === "sending" || status === "sent"}
              onChange={(event) => {
                const next = feedbackCategories.find((value) => value === event.target.value);
                if (next) setCategory(next);
              }}
            >
              {feedbackCategories.map((value) => (
                <option value={value} key={value}>
                  {feedbackCategoryLabels[value]}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            What went wrong?
            <textarea
              value={message}
              minLength={10}
              maxLength={1500}
              required
              rows={3}
              disabled={status === "sending" || status === "sent"}
              onChange={(event) => setMessage(event.target.value)}
            />
          </label>
          <button
            className={styles.button}
            type="submit"
            disabled={status === "sending" || status === "sent"}
          >
            {status === "sending"
              ? "Sending report…"
              : status === "sent"
                ? "Report received"
                : "Send report"}
          </button>
          {notice && <p role="status">{notice}</p>}
        </form>
      )}
    </details>
  );
}
