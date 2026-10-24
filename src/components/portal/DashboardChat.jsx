import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, MessageCircle, Send, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, SectionTitle } from "@/components/widgets";
import { ErrorState, PageSkeleton, useAction } from "@/components/ui-kit";
import { PageTitle, RoleGate } from "@/components/portal/PortalShell";
import {
  loadDashboardChat,
  loadDashboardChatMessages,
  requestPrivateChat,
  reviewPrivateChat,
  sendDashboardChatMessage,
} from "@/lib/platform.functions";
import { useCampus } from "@/lib/use-campus";

const OVERVIEW = ["dashboard-chat"];
const EMPTY_LIST = [];
const messagesKey = (type, id) => ["dashboard-chat-messages", type, id];
const chatKey = (type, id) => `${type}:${id}`;

function requestLabel(request, role) {
  return role === "faculty" || role === "admin"
    ? request.student_name || request.student_id
    : request.teacher_name || "Assigned teacher";
}

export function DashboardChat() {
  const { role, profile } = useCampus();
  const queryClient = useQueryClient();
  const [active, setActive] = useState("");
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState("sections");
  const overview = useQuery({
    queryKey: OVERVIEW,
    queryFn: () => loadDashboardChat(),
    refetchInterval: 15000,
  });
  const sections = overview.data?.sections ?? EMPTY_LIST;
  const requests = overview.data?.requests ?? EMPTY_LIST;
  const selectedSection = sections.find((room) => active === chatKey("section", room.id));
  const selectedRequest = requests.find((request) => active === chatKey("private", request.id));
  const selectedType = selectedSection
    ? "section"
    : selectedRequest?.status === "approved"
      ? "private"
      : "";
  const selectedId = selectedSection?.id ?? (selectedType === "private" ? selectedRequest.id : "");
  const messages = useQuery({
    queryKey: messagesKey(selectedType, selectedId),
    queryFn: () => loadDashboardChatMessages({ data: { type: selectedType, id: selectedId } }),
    enabled: Boolean(selectedType && selectedId),
    refetchInterval: 8000,
  });
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: OVERVIEW }),
      queryClient.invalidateQueries({ queryKey: ["dashboard-chat-messages"] }),
    ]);
  };
  const { busy, run } = useAction(refresh);

  useEffect(() => {
    if (!active && sections.length) setActive(chatKey("section", sections[0].id));
    if (
      active &&
      !sections.some((room) => active === chatKey("section", room.id)) &&
      !requests.some((request) => active === chatKey("private", request.id))
    )
      setActive("");
  }, [active, requests, sections]);

  if (overview.isLoading) return <PageSkeleton rows={3} />;
  if (overview.error) return <ErrorState error={overview.error} onRetry={overview.refetch} />;

  const studentRequest = role === "student" ? requests[0] : null;
  const canRequest =
    role === "student" && (!studentRequest || studentRequest.status === "rejected");
  const activeLabel =
    selectedSection?.label || (selectedRequest && requestLabel(selectedRequest, role));

  return (
    <RoleGate allow={["student", "faculty", "admin"]}>
      <PageTitle title="Chats" sub="Section groups and approved private chats" />
      <div className="mb-4 flex gap-2" role="tablist" aria-label="Chat type">
        {[
          ["sections", "Section groups"],
          ["private", "Private chats"],
        ].map(([key, label]) => (
          <Button
            key={key}
            type="button"
            size="sm"
            role="tab"
            aria-selected={tab === key}
            variant={tab === key ? "default" : "outline"}
            onClick={() => {
              setTab(key);
              if (key === "sections" && sections[0]) setActive(chatKey("section", sections[0].id));
              if (key === "private") {
                const firstChat = requests.find((request) => request.status === "approved");
                setActive(firstChat ? chatKey("private", firstChat.id) : "");
              }
            }}
          >
            {label}
          </Button>
        ))}
      </div>

      {tab === "sections" ? (
        <div className="grid min-h-[32rem] gap-4 lg:grid-cols-[minmax(14rem,0.7fr)_minmax(0,1.6fr)]">
          <section className="surface p-3" aria-label="Section group chats">
            <SectionTitle sub="Students in the same section share a group.">
              <Users className="mr-2 inline size-4" /> Groups
            </SectionTitle>
            {sections.length ? (
              <div className="mt-3 space-y-1">
                {sections.map((room) => (
                  <button
                    key={room.id}
                    type="button"
                    onClick={() => setActive(chatKey("section", room.id))}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted ${active === chatKey("section", room.id) ? "bg-muted font-semibold" : ""}`}
                  >
                    {room.label}
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                A group appears after a section is set on student records.
              </p>
            )}
          </section>
          <ChatPanel
            title={selectedSection?.label}
            messages={messages}
            profileId={profile.id}
            message={message}
            setMessage={setMessage}
            busy={busy}
            onSend={(body) =>
              selectedSection &&
              run(
                () =>
                  sendDashboardChatMessage({
                    data: { type: "section", id: selectedSection.id, body },
                  }),
                "Message sent.",
              ).then((result) => result.ok && setMessage(""))
            }
          />
        </div>
      ) : (
        <div className="grid min-h-[32rem] gap-4 lg:grid-cols-[minmax(14rem,0.7fr)_minmax(0,1.6fr)]">
          <section className="surface p-3" aria-label="Private chats">
            <SectionTitle sub="Private chats need teacher approval before messaging.">
              <MessageCircle className="mr-2 inline size-4" /> Requests and chats
            </SectionTitle>
            {canRequest && (
              <Button
                className="mt-3 w-full"
                size="sm"
                disabled={busy}
                onClick={() =>
                  run(() => requestPrivateChat(), "Chat request sent to your assigned teacher.")
                }
              >
                Request private chat
              </Button>
            )}
            {studentRequest?.status === "pending" && (
              <p className="mt-3 rounded-lg bg-muted p-3 text-sm">
                Your request is waiting for your teacher to approve it.
              </p>
            )}
            {!requests.length && role !== "student" && (
              <p className="mt-3 text-sm text-muted-foreground">No private-chat requests yet.</p>
            )}
            {requests.length > 0 && (
              <div className="mt-3 space-y-1">
                {requests.map((request) => (
                  <div key={request.id} className="rounded-lg border p-2">
                    <button
                      type="button"
                      disabled={request.status !== "approved"}
                      onClick={() => setActive(chatKey("private", request.id))}
                      className={`w-full text-left text-sm ${request.status === "approved" ? "hover:text-primary" : "cursor-default"}`}
                    >
                      <span className="block font-medium">{requestLabel(request, role)}</span>
                      <span className="text-xs capitalize text-muted-foreground">
                        {request.status === "approved" ? "Chat open" : request.status}
                      </span>
                    </button>
                    {(role === "faculty" || role === "admin") && request.status === "pending" && (
                      <div className="mt-2 flex gap-2">
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            run(
                              () =>
                                reviewPrivateChat({
                                  data: { requestId: request.id, decision: "approved" },
                                }),
                              "Private chat approved.",
                            )
                          }
                        >
                          <Check /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            run(
                              () =>
                                reviewPrivateChat({
                                  data: { requestId: request.id, decision: "rejected" },
                                }),
                              "Request declined.",
                            )
                          }
                        >
                          <X /> Decline
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
          {selectedType === "private" ? (
            <ChatPanel
              title={activeLabel}
              messages={messages}
              profileId={profile.id}
              message={message}
              setMessage={setMessage}
              busy={busy}
              onSend={(body) =>
                run(
                  () =>
                    sendDashboardChatMessage({ data: { type: "private", id: selectedId, body } }),
                  "Message sent.",
                ).then((result) => result.ok && setMessage(""))
              }
            />
          ) : (
            <EmptyState
              title="Private chat"
              hint={
                role === "student"
                  ? "Request a private chat with your assigned teacher. You can message after they approve."
                  : "Approve a student's request to open a private conversation."
              }
            />
          )}
        </div>
      )}
    </RoleGate>
  );
}

function ChatPanel({ title, messages, profileId, message, setMessage, busy, onSend }) {
  if (!title)
    return (
      <EmptyState title="Choose a conversation" hint="Select a group or approved private chat." />
    );
  const items = messages.data ?? [];
  return (
    <section className="flex min-h-[32rem] flex-col overflow-hidden rounded-xl border bg-card">
      <div className="border-b p-4">
        <h2 className="font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">Messages are visible only to chat members.</p>
      </div>
      {messages.error ? (
        <div className="p-4">
          <ErrorState error={messages.error} onRetry={messages.refetch} />
        </div>
      ) : messages.isLoading ? (
        <div className="p-4">
          <PageSkeleton rows={2} />
        </div>
      ) : (
        <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
          {!items.length && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No messages yet. Start the conversation.
            </p>
          )}
          {items.map((item) => (
            <div
              key={item.id}
              className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${item.sender_id === profileId ? "ml-auto bg-primary text-primary-foreground" : "bg-muted"}`}
            >
              <p className="mb-1 text-xs font-semibold opacity-80">
                {item.sender_id === profileId ? "You" : item.sender_name}
              </p>
              <p className="whitespace-pre-wrap break-words">{item.body}</p>
              <time className="mt-1 block text-right text-[10px] opacity-70">
                {new Date(item.created_at).toLocaleString()}
              </time>
            </div>
          ))}
        </div>
      )}
      <form
        className="flex items-end gap-2 border-t p-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (message.trim()) onSend(message.trim());
        }}
      >
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={2}
          maxLength={2000}
          aria-label="Write a message"
          placeholder="Write a message…"
          className="min-h-10 flex-1 resize-y rounded-md border bg-background px-3 py-2 text-sm"
        />
        <Button type="submit" disabled={busy || !message.trim()} aria-label="Send message">
          <Send />
        </Button>
      </form>
    </section>
  );
}
