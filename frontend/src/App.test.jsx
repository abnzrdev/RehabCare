import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";

function jsonResponse(payload) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(payload),
    json: async () => payload,
  };
}

describe("clinical wizard patient and KOOS flow", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input) => {
        const url = String(input);

        if (url.includes("/api/health")) {
          return jsonResponse({ status: "ok" });
        }

        if (url.includes("/api/sessions/")) {
          return jsonResponse({ sessions: [] });
        }

        return jsonResponse({});
      }),
    );
  });

  it("shows the redesigned patient context summary cards", () => {
    render(<App />);

    expect(screen.getByText(/saved sessions/i)).toBeInTheDocument();
    expect(screen.getByText(/latest rom/i)).toBeInTheDocument();
    expect(screen.getByText(/latest date/i)).toBeInTheDocument();
  });

  it("shows KOOS in 14 panels with category tags", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getAllByRole("button", { name: /koos questionnaire/i })[0]);

    expect(await screen.findByText(/panel 1 of 14/i)).toBeInTheDocument();
    expect(screen.getByText(/^pain$/i)).toBeInTheDocument();
  });
});
