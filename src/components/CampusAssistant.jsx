import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useRef, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { Compass, X, MessageCircle, ArrowUpRight } from "lucide-react";
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
import { Reasoning, ReasoningTrigger, ReasoningContent } from "@/components/ai-elements/reasoning";
import { Shimmer } from "@/components/ai-elements/shimmer";
const transport = new DefaultChatTransport({ api: "/api/public/chat" });
export function CampusAssistant() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const input = useRef(null);
  const { messages, sendMessage, status, stop, error } = useChat({ id: "campus-guide", transport });
  const busy = status === "submitted" || status === "streaming";
  useEffect(() => {
    if (open && !busy) input.current?.focus();
  }, [open, busy]);
  return (
    <div className="assistant-position">
      {open && (
        <section
          className="assistant-panel flex flex-col overflow-hidden rounded-lg border bg-card shadow-xl"
          aria-label="Pluto campus assistant"
        >
          <header className="flex items-center justify-between gap-3 border-b p-4">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Compass className="size-5" />
              </span>
              <div>
                <h2 className="font-semibold">Pluto · Campus guide</h2>
                <p className="text-xs text-muted-foreground">A clearer next step</p>
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
                  <h3 className="text-lg font-semibold">Hello! Where would you like to begin?</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Ask me about BIB InsightIQ, student support, or your next destination.
                  </p>
                  <div className="mt-4 flex flex-col items-start gap-2">
                    {[
                      "Who needs help?",
                      "Why are they at risk?",
                      "What should faculty do next?",
                    ].map((q) => (
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
                      ) : p.type === "reasoning" ? (
                        <Reasoning key={i} defaultOpen={false}>
                          <ReasoningTrigger />
                          <ReasoningContent>{p.text}</ReasoningContent>
                        </Reasoning>
                      ) : null,
                    )}
                  </MessageContent>
                </Message>
              ))}
              {status === "submitted" && <Shimmer>Finding your next step…</Shimmer>}
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
              <Link to="/solution" onClick={() => setOpen(false)} className="text-primary">
                Why BIB InsightIQ
              </Link>
              <Link to="/privacy" onClick={() => setOpen(false)} className="text-primary">
                Privacy
              </Link>
              <Link to="/auth" onClick={() => setOpen(false)} className="text-primary">
                Sign in
              </Link>
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
                placeholder="Ask your campus guide…"
                aria-label="Message the campus guide"
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
            <p className="mt-2 text-center text-[10px] text-muted-foreground">
              AI guidance · This visit only · No confidential information
            </p>
          </div>
        </section>
      )}
      <Button
        className="ml-auto flex h-12 gap-2 rounded-full px-5 shadow-lg"
        aria-label={open ? "Hide campus guide" : "Ask Pluto, the campus guide"}
        onClick={() => setOpen(!open)}
      >
        {open ? <X /> : <MessageCircle className="motion-icon" />}
        <span>Ask Pluto</span>
      </Button>
    </div>
  );
}
