import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { toApiError } from "@/lib/api/client";
import { ExperimentForm, experimentToFormValues } from "./experiment-form";

const defaults = { ...experimentToFormValues(), name: "Cure at 80 °C", start_date: "2026-09-21" };

function setup(onSubmit = vi.fn().mockResolvedValue(undefined)) {
  const user = userEvent.setup();
  render(<ExperimentForm defaultValues={defaults} onSubmit={onSubmit} submitLabel="Save" />);
  return { user, onSubmit };
}

describe("ExperimentForm", () => {
  it("blocks an end date before the start date and links the error to the field", async () => {
    const { user, onSubmit } = setup();
    const end = screen.getByLabelText("End date");
    await user.type(end, "2026-09-20");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(end).toHaveAttribute("aria-invalid", "true");
    expect(end).toHaveAccessibleDescription(/End date must be on or after the start date/);
    expect(end).toHaveFocus();
  });

  it("submits validated values", async () => {
    const { user, onSubmit } = setup();
    await user.selectOptions(screen.getByLabelText("Status"), "running");
    await user.type(screen.getByLabelText("End date"), "2026-09-21");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: "Cure at 80 °C",
      description: "",
      status: "running",
      start_date: "2026-09-21",
      end_date: "2026-09-21",
    });
  });

  it("offers exactly the backend's statuses", () => {
    setup();
    const options = screen.getAllByRole("option").map((o) => o.getAttribute("value"));
    expect(options).toEqual(["planned", "running", "completed", "archived"]);
  });

  it("shows server-side validation errors on the matching field", async () => {
    const serverError = toApiError(422, {
      detail: "Request validation failed",
      errors: [{ location: "body", field: "name", message: "Name already used in this project" }],
    });
    const { user } = setup(vi.fn().mockRejectedValue(serverError));
    await user.click(screen.getByRole("button", { name: "Save" }));

    const name = await screen.findByLabelText("Name");
    expect(name).toHaveAccessibleDescription("Name already used in this project");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows non-field failures as a form-level alert", async () => {
    const { user } = setup(vi.fn().mockRejectedValue(toApiError(500, { detail: "Internal server error" })));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Internal server error");
  });
});
