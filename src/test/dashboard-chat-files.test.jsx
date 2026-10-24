import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const ROOM = "00000000-0000-4000-8000-000000000001";
const MESSAGE = "00000000-0000-4000-8000-000000000002";
let role = "faculty";

const send = vi.fn(async () => ({ id: MESSAGE }));
const download = vi.fn(async () => ({
  name: "notes.pdf",
  type: "application/pdf",
  base64: "QQ==",
}));

vi.mock("@/lib/use-campus", () => ({ useCampus: () => ({ role, profile: { id: "me" } }) }));
vi.mock("@/components/portal/PortalShell", () => ({
  PageTitle: () => null,
  RoleGate: ({ children }) => children,
}));
vi.mock("@/lib/platform.functions", () => ({
  loadDashboardChat: vi.fn(async () => ({
    sections: [{ id: ROOM, label: "CSE 3A" }],
    requests: [],
  })),
  loadDashboardChatMessages: vi.fn(async () => [
    {
      id: MESSAGE,
      sender_id: "t",
      sender_name: "Tina",
      body: "",
      created_at: "2026-01-01T10:00:00Z",
      file_name: "notes.pdf",
      file_type: "application/pdf",
      has_file: true,
      file_size: 2048,
    },
  ]),
  requestPrivateChat: vi.fn(),
  reviewPrivateChat: vi.fn(),
  sendDashboardChatMessage: (...a) => send(...a),
  downloadDashboardChatFile: (...a) => download(...a),
}));

import { DashboardChat } from "@/components/portal/DashboardChat";

const renderChat = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <DashboardChat />
    </QueryClientProvider>,
  );

beforeEach(() => {
  send.mockClear();
  download.mockClear();
});

describe("files in dashboard chats", () => {
  it("shows a file message as a download with its name and size, and fetches it by message id", async () => {
    role = "student";
    renderChat();
    const button = await screen.findByRole("button", { name: /notes\.pdf · 2 KB/ });
    fireEvent.click(button);
    await waitFor(() => expect(download).toHaveBeenCalled());
    expect(download.mock.calls[0][0]).toEqual({
      data: { type: "section", id: ROOM, messageId: MESSAGE },
    });
  });

  it("offers attaching a file to teachers, not to students", async () => {
    role = "student";
    const { unmount } = renderChat();
    await screen.findByLabelText("Write a message");
    expect(screen.queryByText("Attach a file")).not.toBeInTheDocument();
    unmount();
    role = "faculty";
    renderChat();
    expect(await screen.findByText("Attach a file")).toBeInTheDocument();
  });

  it("lets a teacher send a file with no text", async () => {
    role = "faculty";
    const { container } = renderChat();
    await screen.findByText("Attach a file");
    const send_ = screen.getByRole("button", { name: "Send message" });
    expect(send_).toBeDisabled();
    const input = container.querySelector('input[type="file"]');
    fireEvent.change(input, {
      target: { files: [new File(["hello"], "plan.pdf", { type: "application/pdf" })] },
    });
    await waitFor(() => expect(send_).toBeEnabled());
    fireEvent.click(send_);
    await waitFor(() => expect(send).toHaveBeenCalled());
    const { data } = send.mock.calls[0][0];
    expect(data).toMatchObject({ type: "section", id: ROOM, body: "" });
    expect(data.file.name).toBe("plan.pdf");
  });
});
