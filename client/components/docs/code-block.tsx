"use client";

import { useState } from "react";

import type { CodeLanguage } from "@/content/docs";
import { cn } from "@/lib/utils";

type TokenType =
  | "plain"
  | "comment"
  | "string"
  | "number"
  | "keyword"
  | "property"
  | "punctuation"
  | "operator"
  | "command"
  | "flag"
  | "env"
  | "type";

type Token = {
  type: TokenType;
  value: string;
};

type Pattern = {
  type: TokenType;
  regex: RegExp;
};

type CodeBlockProps = {
  label: string;
  language: CodeLanguage;
  code: string;
  filename?: string;
  className?: string;
};

const sharedLeadingPatterns: Pattern[] = [
  {
    type: "punctuation",
    regex: /^[{}()[\].,;]/,
  },
  {
    type: "operator",
    regex: /^(?:=>|===|!==|==|!=|<=|>=|\|\||&&|=|:|\+|-|\*|\/)/,
  },
];

const typeScriptPatterns: Pattern[] = [
  {
    type: "comment",
    regex: /^\/\/.*/,
  },
  {
    type: "string",
    regex: /^"(?:\\.|[^"])*"|^'(?:\\.|[^'])*'|^`(?:\\.|[^`])*`/,
  },
  {
    type: "property",
    regex: /^[A-Za-z_$][\w$]*(?=\s*:)/,
  },
  {
    type: "keyword",
    regex:
      /^(?:import|from|export|const|let|var|return|await|async|type|interface|function|if|else|throw|try|catch|new|as|extends|implements)\b/,
  },
  {
    type: "keyword",
    regex: /^(?:true|false|null|undefined)\b/,
  },
  {
    type: "number",
    regex: /^\d+(?:\.\d+)?n?\b/,
  },
  {
    type: "type",
    regex: /^[A-Z][A-Za-z0-9_]*/,
  },
  {
    type: "command",
    regex: /^[a-zA-Z_$][\w$]*(?=\()/,
  },
];

const solidityPatterns: Pattern[] = [
  {
    type: "comment",
    regex: /^\/\/.*/,
  },
  {
    type: "string",
    regex: /^"(?:\\.|[^"])*"|^'(?:\\.|[^'])*'/,
  },
  {
    type: "keyword",
    regex:
      /^(?:pragma|import|contract|interface|struct|enum|event|error|function|returns|return|external|public|private|internal|view|pure|payable|memory|storage|calldata|indexed|modifier|if|else|revert|emit|constructor|mapping)\b/,
  },
  {
    type: "type",
    regex:
      /^(?:address|bool|bytes\d*|bytes32|string|uint\d*|int\d*|IERC20|IRenewVault|BillingMode|SubscriptionStatus|ChargeStatus|Merchant|Plan|Subscription|Charge)\b/,
  },
  {
    type: "number",
    regex: /^\d+(?:\.\d+)?\b/,
  },
  {
    type: "command",
    regex: /^[A-Za-z_$][\w$]*(?=\()/,
  },
];

const bashPatterns: Pattern[] = [
  {
    type: "comment",
    regex: /^#.*/,
  },
  {
    type: "string",
    regex: /^"(?:\\.|[^"])*"|^'(?:\\.|[^'])*'/,
  },
  {
    type: "env",
    regex: /^\$[A-Z_][A-Z0-9_]*/,
  },
  {
    type: "env",
    regex: /^[A-Z_][A-Z0-9_]*(?==)/,
  },
  {
    type: "flag",
    regex: /^--?[A-Za-z][\w-]*/,
  },
  {
    type: "command",
    regex: /^(?:curl|export|printf|node|npm|pnpm|yarn|jq)\b/,
  },
  {
    type: "keyword",
    regex: /^(?:GET|POST|PATCH|DELETE|PUT)\b/,
  },
  {
    type: "number",
    regex: /^\d+(?:\.\d+)?/,
  },
];

const jsonPatterns: Pattern[] = [
  {
    type: "property",
    regex: /^"(?:\\.|[^"])*"(?=\s*:)/,
  },
  {
    type: "string",
    regex: /^"(?:\\.|[^"])*"/,
  },
  {
    type: "keyword",
    regex: /^(?:true|false|null)\b/,
  },
  {
    type: "number",
    regex: /^\d+(?:\.\d+)?/,
  },
];

const tokenClassNames: Record<TokenType, string> = {
  plain: "docs-token-plain",
  comment: "docs-token-comment",
  string: "docs-token-string",
  number: "docs-token-number",
  keyword: "docs-token-keyword",
  property: "docs-token-property",
  punctuation: "docs-token-punctuation",
  operator: "docs-token-operator",
  command: "docs-token-command",
  flag: "docs-token-flag",
  env: "docs-token-env",
  type: "docs-token-type",
};

function getPatterns(language: CodeLanguage) {
  if (language === "bash") {
    return bashPatterns;
  }

  if (language === "sol") {
    return solidityPatterns;
  }

  if (language === "json") {
    return jsonPatterns;
  }

  return typeScriptPatterns;
}

function tokenizeLine(line: string, language: CodeLanguage) {
  const tokens: Token[] = [];
  const patterns = getPatterns(language);
  let remaining = line;

  while (remaining.length > 0) {
    const whitespace = remaining.match(/^\s+/);

    if (whitespace) {
      tokens.push({
        type: "plain",
        value: whitespace[0],
      });
      remaining = remaining.slice(whitespace[0].length);
      continue;
    }

    let matchedToken: Token | null = null;

    for (const pattern of patterns) {
      const match = remaining.match(pattern.regex);

      if (!match) {
        continue;
      }

      matchedToken = {
        type: pattern.type,
        value: match[0],
      };
      break;
    }

    if (!matchedToken) {
      for (const pattern of sharedLeadingPatterns) {
        const match = remaining.match(pattern.regex);

        if (!match) {
          continue;
        }

        matchedToken = {
          type: pattern.type,
          value: match[0],
        };
        break;
      }
    }

    if (matchedToken) {
      tokens.push(matchedToken);
      remaining = remaining.slice(matchedToken.value.length);
      continue;
    }

    tokens.push({
      type: "plain",
      value: remaining[0],
    });
    remaining = remaining.slice(1);
  }

  return tokens;
}

function getLanguageLabel(language: CodeLanguage) {
  if (language === "ts" || language === "tsx") {
    return language === "tsx" ? "TSX" : "TypeScript";
  }

  if (language === "json") {
    return "JSON";
  }

  if (language === "sol") {
    return "Solidity";
  }

  return "Bash";
}

export function CodeBlock({
  language,
  code,
  className,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const lines = code.replace(/\n$/, "").split("\n");

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[1.65rem] border border-white/10 bg-[#0c0f0d] shadow-[0_24px_80px_rgba(9,15,12,0.28)]",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 bg-white/[0.03] px-4 py-3 sm:px-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/48">
          {getLanguageLabel(language)}
        </p>

        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold tracking-[0.08em] text-[#d9f6bc] transition-colors hover:bg-white/[0.08]"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <pre className="overflow-x-auto px-4 py-4 text-sm leading-7 sm:px-5">
        <code className="block font-mono">
          {lines.map((line, lineIndex) => (
            <span key={`${lineIndex}-${line}`} className="grid grid-cols-[auto_minmax(0,1fr)] gap-4">
              <span className="select-none pt-px text-right text-white/24">
                {String(lineIndex + 1).padStart(2, "0")}
              </span>
              <span className="whitespace-pre">
                {line.length > 0
                  ? tokenizeLine(line, language).map((token, tokenIndex) => (
                    <span
                      key={`${lineIndex}-${tokenIndex}-${token.value}`}
                      className={tokenClassNames[token.type]}
                    >
                      {token.value}
                    </span>
                  ))
                  : " "}
              </span>
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}
