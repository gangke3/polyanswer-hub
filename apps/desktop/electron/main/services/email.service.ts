import nodemailer from "nodemailer";
import { type AppSettings, type ProviderRunResult, type SynthesisResult, type TaskRecord } from "@multi-ai/shared";
import { BRAND } from "../../common/brand.js";
import { formatTaskResultText } from "./task-output.js";

function createTransport(settings: AppSettings["email"]) {
  return nodemailer.createTransport({
    host: settings.smtpHost,
    port: settings.smtpPort,
    secure: settings.smtpSecure,
    auth: {
      user: settings.smtpUser,
      pass: settings.smtpPass
    }
  });
}

function createSubject(task: TaskRecord): string {
  const question = task.question.replace(/\s+/g, " ").trim().slice(0, 32);
  return `${BRAND.emailSubjectPrefix} - ${question || task.id}`;
}

export async function sendTaskResultEmail(
  settings: AppSettings,
  payload: {
    task: TaskRecord;
    answers: ProviderRunResult[];
    synthesis?: SynthesisResult;
    autoSummary?: ProviderRunResult;
  }
): Promise<void> {
  const emailSettings = settings.email;

  if (!emailSettings.enabled) {
    return;
  }

  if (!emailSettings.recipientEmail.trim()) {
    throw new Error("Email sending is enabled, but recipientEmail is empty.");
  }

  const transporter = createTransport(emailSettings);
  const text = formatTaskResultText(payload);

  await transporter.sendMail({
    from: emailSettings.smtpUser,
    to: emailSettings.recipientEmail.trim(),
    subject: createSubject(payload.task),
    text
  });
}
