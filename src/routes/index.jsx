import { createFileRoute } from "@tanstack/react-router";
import { SlqgLanding } from "@/components/landing/SlqgLanding";
import slqgCss from "@/components/landing/slqg.css?url";

const TITLE = "SLQG — Student Learning, Quality & Growth";
const DESCRIPTION =
  "SLQG connects seven campus data domains to explainable scores and human-led student support. Explore an interactive illustrative demo.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: slqgCss },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;450;500;550;600;650;700&family=Manrope:wght@400;500;600;650;700;750;800&display=swap",
      },
    ],
  }),
  component: SlqgLanding,
});
