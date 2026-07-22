"use client";

import type { AgentInputSchema } from "@agentface/core";
import { AgentFaceError, defineAgentFace } from "@agentface/core";
import type { ReactNode } from "react";
import { AgentSurface } from "./surface.js";
import { useAgentAction } from "./use-agent-action.js";
import { useAgentResource } from "./use-agent-resource.js";

/**
 * App knowledge for the assistant: register your product's help content and
 * the agent can search it, read it, and ground its answers in it — so
 * "how do I…?" questions get answered from YOUR docs, and the agent knows
 * your app's rules before acting.
 */

/** One help article. Keep bodies focused; the agent reads them whole. */
export interface AgentHelpArticle {
  readonly id: string;
  readonly title: string;
  /** Markdown or plain text. */
  readonly body: string;
  readonly tags?: readonly string[];
}

/** Props for {@link AgentFaceKnowledge}. */
export interface AgentFaceKnowledgeProps {
  readonly articles: readonly AgentHelpArticle[];
  /** Surface name shown to agents. Default "Help & documentation". */
  readonly name?: string;
}

const knowledgeFace = defineAgentFace({
  id: "app.knowledge",
  name: "Help & documentation",
  description:
    "The application's help articles: how features work, rules, and limits. Search here before answering questions about the app.",
  version: "0.1.0",
  tags: ["knowledge", "help"],
});

interface SearchInput {
  readonly query: string;
}

const searchSchema: AgentInputSchema<SearchInput> = {
  parse(input: unknown): SearchInput {
    const query =
      typeof input === "object" && input !== null
        ? (input as { query?: unknown }).query
        : undefined;
    if (typeof query !== "string" || query.trim().length === 0) {
      throw new AgentFaceError({
        code: "INVALID_INPUT",
        message: "query must be a non-empty string",
      });
    }
    return { query: query.trim() };
  },
  toJSONSchema: () => ({
    type: "object",
    properties: {
      query: { type: "string", description: "Keywords to search for" },
    },
    required: ["query"],
    additionalProperties: false,
  }),
};

interface ReadInput {
  readonly articleId: string;
}

const readSchema: AgentInputSchema<ReadInput> = {
  parse(input: unknown): ReadInput {
    const articleId =
      typeof input === "object" && input !== null
        ? (input as { articleId?: unknown }).articleId
        : undefined;
    if (typeof articleId !== "string" || articleId.length === 0) {
      throw new AgentFaceError({
        code: "INVALID_INPUT",
        message: "articleId must be a non-empty string",
      });
    }
    return { articleId };
  },
  toJSONSchema: () => ({
    type: "object",
    properties: {
      articleId: {
        type: "string",
        description: "An article id from help-topics or search results",
      },
    },
    required: ["articleId"],
    additionalProperties: false,
  }),
};

function score(article: AgentHelpArticle, terms: readonly string[]): number {
  const title = article.title.toLowerCase();
  const body = article.body.toLowerCase();
  const tags = (article.tags ?? []).join(" ").toLowerCase();
  let total = 0;
  for (const term of terms) {
    if (title.includes(term)) {
      total += 3;
    }
    if (tags.includes(term)) {
      total += 2;
    }
    if (body.includes(term)) {
      total += 1;
    }
  }
  return total;
}

function snippet(article: AgentHelpArticle, terms: readonly string[]): string {
  const body = article.body;
  const lower = body.toLowerCase();
  for (const term of terms) {
    const index = lower.indexOf(term);
    if (index >= 0) {
      const start = Math.max(0, index - 60);
      const end = Math.min(body.length, index + 120);
      return `${start > 0 ? "…" : ""}${body.slice(start, end).trim()}${end < body.length ? "…" : ""}`;
    }
  }
  return body.slice(0, 140);
}

function KnowledgeCapabilities({
  articles,
}: {
  readonly articles: readonly AgentHelpArticle[];
}): null {
  useAgentResource({
    id: "help-topics",
    name: "Help topics",
    description: "Every available help article: id, title, and tags",
    getValue: () =>
      articles.map((article) => ({
        id: article.id,
        title: article.title,
        ...(article.tags !== undefined ? { tags: article.tags } : {}),
      })),
  });

  useAgentAction({
    id: "search-help",
    name: "Search help",
    description:
      "Keyword-search the application's help articles. Use this FIRST when the user asks how something works, what a rule is, or why something happened — then ground your answer in what you find.",
    input: searchSchema,
    execute: (input) => {
      const terms = input.query
        .toLowerCase()
        .split(/\s+/)
        .filter((term) => term.length > 1);
      const results = articles
        .map((article) => ({ article, relevance: score(article, terms) }))
        .filter((entry) => entry.relevance > 0)
        .sort((a, b) => b.relevance - a.relevance)
        .slice(0, 3)
        .map((entry) => ({
          articleId: entry.article.id,
          title: entry.article.title,
          snippet: snippet(entry.article, terms),
        }));
      return { results };
    },
  });

  useAgentAction({
    id: "read-help-article",
    name: "Read help article",
    description: "Read one help article in full, by id.",
    input: readSchema,
    execute: (input) => {
      const article = articles.find(
        (candidate) => candidate.id === input.articleId,
      );
      if (article === undefined) {
        throw new AgentFaceError({
          code: "RESOURCE_NOT_FOUND",
          message: `No help article "${input.articleId}"`,
        });
      }
      return { title: article.title, body: article.body };
    },
  });

  return null;
}

/**
 * Mounts the app-knowledge surface: a `help-topics` resource plus
 * `search-help` and `read-help-article` actions over the articles you
 * provide. Render once inside your `<AgentFaceProvider>` (typically in the
 * layout) and the assistant can answer product questions from your own
 * documentation — and knows your app's rules before it acts.
 *
 * @example
 * ```tsx
 * <AgentFaceKnowledge
 *   articles={[
 *     {
 *       id: "discounts",
 *       title: "Invoice discounts",
 *       body: "Discounts up to 20% apply immediately. Above 20% requires explicit approval…",
 *       tags: ["invoices", "discounts"],
 *     },
 *   ]}
 * />
 * ```
 */
export function AgentFaceKnowledge(props: AgentFaceKnowledgeProps): ReactNode {
  return (
    <AgentSurface face={knowledgeFace}>
      <KnowledgeCapabilities articles={props.articles} />
    </AgentSurface>
  );
}
