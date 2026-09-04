import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMailMock = vi.fn();
const createTransportMock = vi.fn(() => ({ sendMail: sendMailMock }));

vi.mock("nodemailer", () => ({
  createTransport: (...args: unknown[]) => createTransportMock(...(args as [])),
}));

const getConfigMock = vi.fn();
vi.mock("../config", () => ({ getConfig: () => getConfigMock() }));

import { parseConfig } from "../config.schema";
import { MailNotConfiguredError, isMailConfigured, sendMail } from "./index";

const baseEnv = {
  DATABASE_URL: "postgresql://wishlist:pw@localhost:5432/wishlist",
  AUTH_SECRET: "x".repeat(32),
  APP_URL: "http://localhost:3000",
};

const mailEnv = {
  MAIL_SMTP_HOST: "smtp.example.net",
  MAIL_SMTP_PORT: "587",
  MAIL_SMTP_USER: "apikey",
  MAIL_SMTP_PASS: "s3cret",
  MAIL_FROM: "wishlist@example.com",
};

/** Point the module's config accessor at a parsed environment. */
function useEnv(env: Record<string, string>) {
  getConfigMock.mockReturnValue(parseConfig({ ...baseEnv, ...env }));
}

beforeEach(() => {
  sendMailMock.mockReset().mockResolvedValue({ messageId: "1" });
  createTransportMock.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("config validation", () => {
  it("accepts an environment with no mail settings at all", () => {
    // Email is optional (ADR-0011). Unset must boot, not fail.
    expect(() => parseConfig(baseEnv)).not.toThrow();
  });

  it("accepts all five together", () => {
    expect(() => parseConfig({ ...baseEnv, ...mailEnv })).not.toThrow();
  });

  it("rejects a host with no password, naming what is missing", () => {
    // The dangerous middle state: configured enough to look configured, and
    // guaranteed to fail on the one send that matters.
    const { MAIL_SMTP_PASS: _omitted, ...partial } = mailEnv;
    expect(() => parseConfig({ ...baseEnv, ...partial })).toThrow(/MAIL_SMTP_PASS/);
  });

  it("rejects any other partial combination", () => {
    for (const key of Object.keys(mailEnv)) {
      const partial = { ...mailEnv };
      delete partial[key as keyof typeof mailEnv];
      expect(() => parseConfig({ ...baseEnv, ...partial })).toThrow(/none of them/);
    }
  });

  it("rejects a MAIL_FROM that is not an email address", () => {
    expect(() =>
      parseConfig({ ...baseEnv, ...mailEnv, MAIL_FROM: "Wishlist <not an address>" }),
    ).toThrow(/MAIL_FROM/);
  });

  it("reads five empty strings as no mail at all", () => {
    // What docker compose actually sends for an operator who configured no
    // provider: `${VAR:-}` sets the variable to "", it does not omit it. Before
    // `optionalEnv`, this refused to boot — taking the whole app down over a
    // feature nobody asked for (T110).
    const blank = Object.fromEntries(Object.keys(mailEnv).map((k) => [k, ""]));
    const config = parseConfig({ ...baseEnv, ...blank });

    expect(config.MAIL_SMTP_HOST).toBeUndefined();
    expect(config.MAIL_SMTP_PORT).toBeUndefined();
    expect(config.MAIL_FROM).toBeUndefined();
  });

  it("reads a whitespace-only value as absent too", () => {
    // `MAIL_SMTP_PASS=" "` is a typo, never a password.
    const blank = Object.fromEntries(Object.keys(mailEnv).map((k) => [k, "   "]));
    expect(() => parseConfig({ ...baseEnv, ...blank })).not.toThrow();
  });

  it("still catches a partial mailer once blanks are normalised", () => {
    // The all-or-nothing rule has to survive the empty-string handling: four
    // real values and one blank is a misconfiguration, not "no mail".
    expect(() =>
      parseConfig({ ...baseEnv, ...mailEnv, MAIL_SMTP_PASS: "" }),
    ).toThrow(/MAIL_SMTP_PASS/);
  });

  it("reads an empty optional MercadoLibre key as absent", () => {
    // Same defect, same fix — and this one was already live in production
    // compose before T110.
    const config = parseConfig({
      ...baseEnv,
      MELI_CLIENT_ID: "",
      MELI_CLIENT_SECRET: "",
    });
    expect(config.MELI_CLIENT_ID).toBeUndefined();
  });

  it("still rejects an empty required key", () => {
    // optionalEnv is deliberately not applied to these: a blank AUTH_SECRET
    // should fail as loudly as a missing one.
    expect(() => parseConfig({ ...baseEnv, AUTH_SECRET: "" })).toThrow(/AUTH_SECRET/);
  });

  it("coerces MAIL_SMTP_PORT to a number", () => {
    expect(parseConfig({ ...baseEnv, ...mailEnv }).MAIL_SMTP_PORT).toBe(587);
  });

  it("rejects a non-positive MAIL_SMTP_PORT", () => {
    expect(() =>
      parseConfig({ ...baseEnv, ...mailEnv, MAIL_SMTP_PORT: "0" }),
    ).toThrow(/MAIL_SMTP_PORT/);
  });
});

describe("isMailConfigured", () => {
  it("is false with no mail settings", () => {
    useEnv({});
    expect(isMailConfigured()).toBe(false);
  });

  it("is true once configured", () => {
    useEnv(mailEnv);
    expect(isMailConfigured()).toBe(true);
  });
});

describe("sendMail", () => {
  it("sends through the transport when configured", async () => {
    useEnv(mailEnv);

    await sendMail({ to: "ana@example.org", subject: "Hola", text: "Cuerpo" });

    expect(sendMailMock).toHaveBeenCalledWith({
      from: "wishlist@example.com",
      to: "ana@example.org",
      subject: "Hola",
      text: "Cuerpo",
    });
  });

  it("passes the HTML part only when there is one", async () => {
    useEnv(mailEnv);

    await sendMail({ to: "ana@example.org", subject: "Hola", text: "T", html: "<p>T</p>" });

    expect(sendMailMock.mock.calls[0][0]).toMatchObject({ html: "<p>T</p>" });
  });

  it("configures the transport with an explicit timeout", async () => {
    // A hanging provider must not pin the request it was sent from.
    useEnv(mailEnv);
    await sendMail({ to: "ana@example.org", subject: "Hola", text: "T" });

    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "smtp.example.net",
        port: 587,
        secure: false,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 10_000,
      }),
    );
  });

  it("uses implicit TLS on port 465", async () => {
    useEnv({ ...mailEnv, MAIL_SMTP_PORT: "465" });
    await sendMail({ to: "ana@example.org", subject: "Hola", text: "T" });

    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({ port: 465, secure: true }),
    );
  });

  it("throws rather than silently succeeding when unconfigured", async () => {
    // The failure mode this prevents: a caller believing mail went out, and a
    // broken configuration going unnoticed until someone needs a reset link.
    useEnv({});

    await expect(
      sendMail({ to: "ana@example.org", subject: "Hola", text: "T" }),
    ).rejects.toBeInstanceOf(MailNotConfiguredError);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("logs the recipient domain and nothing else, then rethrows", async () => {
    useEnv(mailEnv);
    sendMailMock.mockRejectedValue(new Error("535 auth failed"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      sendMail({ to: "ana@example.org", subject: "Restablece tu contraseña", text: "token" }),
    ).rejects.toThrow("535 auth failed");

    const line = logged.mock.calls[0].join(" ");
    expect(line).toContain("example.org");
    // Never the address, never the subject — a reset mail's subject and body
    // are exactly where a token would leak into a log file.
    expect(line).not.toContain("ana@example.org");
    expect(line).not.toContain("Restablece");
  });
});
