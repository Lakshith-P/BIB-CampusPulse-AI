import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useRef, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { Compass, X, MessageCircle, ArrowUpRight, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { useAccount } from "@/lib/account";
import { LOOKUP_LABELS, ROLE_COPY, STARTERS, roleOf } from "@/lib/assistant-starters";

const transport = new DefaultChatTransport({ api: "/api/public/chat" });

/** The records a reply was built from, so people can see where an answer came from. */
function Sources({ parts }) {
  const used = [
    ...new Set(
      parts
        .filter((p) => p.type === "data-lookups")
        .flatMap((p) => p.data?.tools ?? [])
        .map((tool) => LOOKUP_LABELS[tool])
        .filter(Boolean),
    ),
  ];
  if (!used.length) return null;
  return (
    <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
      <Database className="size-3" /> Looked up: {used.join(", ")}
    </p>
  );
}

export function CampusAssistant() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const input = useRef(null);
  const { user } = useAccount();
  const role = roleOf(user);
  const copy = ROLE_COPY[role];
  // A different signed-in person (or signing out) starts a fresh conversation, so one person's
  // answers are never shown to the next.
  const { messages, sendMessage, status, stop, error } = useChat({
    id: `campus-guide-${user?.id ?? "visitor"}`,
    transport,
  });
  const busy = status === "submitted" || status === "streaming";
  useEffect(() => {
    if (open && !busy) input.current?.focus();
  }, [open, busy]);
  return (
    <div className="assistant-position">
      {open && (
        <section
          className="assistant-panel flex flex-col overflow-hidden rounded-lg border bg-card shadow-xl"
          aria-label="Pluto assistant"
        >
          <header className="flex items-center justify-between gap-3 border-b p-4">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Compass className="size-5" />
              </span>
              <div>
                <h2 className="font-semibold">{copy.title}</h2>
                <p className="text-xs text-muted-foreground">{copy.tagline}</p>
              </div>
            </div>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Close assistant"
              onClick={() => setOpen(false)}
            >
              <X />
            </Button>
          </header>
          <Conversation className="min-h-0 flex-1">
            <ConversationContent className="gap-5 p-4">
              {messages.length === 0 && (
                <div>
                  <h3 className="text-lg font-semibold">{copy.heading}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{copy.intro}</p>
                  <div className="mt-4 flex flex-col items-start gap-2">
                    {STARTERS[role].map((q) => (
                      <Button
                        key={q}
                        variant="outline"
                        size="sm"
                        className="h-auto whitespace-normal py-2 text-left"
                        onClick={() => void sendMessage({ text: q })}
                      >
                        {q}
                        <ArrowUpRight />
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((m) => (
                <Message key={m.id} from={m.role}>
                  <MessageContent
                    className={m.role === "user" ? "bg-primary text-primary-foreground" : ""}
                  >
                    {m.parts.map((p, i) =>
                      p.type === "text" ? (
                        <MessageResponse key={i}>{p.text}</MessageResponse>
                      ) : null,
                    )}
                    {m.role === "assistant" && <Sources parts={m.parts} />}
                  </MessageContent>
                </Message>
              ))}
              {status === "submitted" && <Shimmer>Looking that up…</Shimmer>}
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error.message}
                </p>
              )}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>
          <div className="border-t p-3">
            <div className="mb-3 flex gap-3 text-xs">
              {user ? (
                <Link to="/portal" onClick={() => setOpen(false)} className="text-primary">
                  My dashboard
                </Link>
              ) : (
                <>
                  <Link to="/solution" onClick={() => setOpen(false)} className="text-primary">
                    Why SLQG
                  </Link>
                  <Link to="/privacy" onClick={() => setOpen(false)} className="text-primary">
                    Privacy
                  </Link>
                  <Link to="/auth" onClick={() => setOpen(false)} className="text-primary">
                    Sign in
                  </Link>
                </>
              )}
            </div>
            <PromptInput
              onSubmit={async ({ text: prompt }) => {
                if (!prompt.trim() || busy) return;
                setText("");
                await sendMessage({ text: prompt });
                input.current?.focus();
              }}
            >
              <PromptInputTextarea
                ref={input}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={copy.placeholder}
                aria-label="Message Pluto"
                className="min-h-16"
              />
              <PromptInputFooter className="justify-end">
                <PromptInputSubmit
                  status={status}
                  onStop={() => void stop()}
                  disabled={!busy && !text.trim()}
                />
              </PromptInputFooter>
            </PromptInput>
            <p className="mt-2 text-center text-[10px] text-muted-foreground">{copy.footer}</p>
          </div>
        </section>
      )}
      <Button
        className="ml-auto flex h-12 gap-2 rounded-full px-5 shadow-lg"
        aria-label={open ? "Hide Pluto" : "Ask Pluto"}
        onClick={() => setOpen(!open)}
      >
        {open ? <X /> : <MessageCircle className="motion-icon" />}
        <span>Ask Pluto</span>
      </Button>
    </div>
  );
}
