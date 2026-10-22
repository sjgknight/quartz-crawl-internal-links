import type { QuartzTransformerPlugin, BuildCtx } from "@quartz-community/types";
import type { Element, Root } from "hast";
import { visit } from "unist-util-visit";

export interface LinkClassRule {
  /**
   * Match links whose destination is inside this directory.
   * Examples: "zotero", "DECRA/research", "tags".
   */
  directory?: string;

  /**
   * Match a destination slug starting with this prefix.
   * Unlike directory, this can match partial slug segments.
   */
  slugPrefix?: string;

  /**
   * Match one exact destination slug.
   */
  exactSlug?: string;

  /**
   * CSS class or classes to add when the rule matches.
   */
  className: string | string[];
}

export interface LinkClassesOptions {
  /**
   * Rules are evaluated against the destination of internal links.
   * Multiple rules can match the same link.
   */
  rules: LinkClassRule[];
}

const defaultOptions: LinkClassesOptions = {
  rules: [],
};

/**
 * Normalise a slug or directory path for consistent matching.
 */
function normaliseSlug(value: string): string {
  return decodeURIComponent(value)
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/+/g, "/");
}

/**
 * Return true when a slug belongs to a directory.
 *
 * "zotero/paper-a" matches "zotero".
 * "zotero/subfolder/paper-a" also matches "zotero".
 * "zotero-extra/paper-a" does not match "zotero".
 */
function isInDirectory(slug: string, directory: string): boolean {
  const normalisedSlug = normaliseSlug(slug);
  const normalisedDirectory = normaliseSlug(directory);

  return (
    normalisedSlug === normalisedDirectory || normalisedSlug.startsWith(`${normalisedDirectory}/`)
  );
}

function matchesRule(slug: string, rule: LinkClassRule): boolean {
  const target = normaliseSlug(slug);

  if (rule.directory && isInDirectory(target, rule.directory)) {
    return true;
  }

  if (rule.slugPrefix) {
    const prefix = normaliseSlug(rule.slugPrefix);

    if (target.startsWith(prefix)) {
      return true;
    }
  }

  if (rule.exactSlug && target === normaliseSlug(rule.exactSlug)) {
    return true;
  }

  return false;
}

export const LinkClasses: QuartzTransformerPlugin<Partial<LinkClassesOptions>> = (userOpts) => {
  const opts: LinkClassesOptions = {
    ...defaultOptions,
    ...userOpts,
    rules: userOpts?.rules ?? defaultOptions.rules,
  };

  return {
    name: "LinkClasses",

    htmlPlugins(_ctx: BuildCtx) {
      return [
        () => {
          return (tree: Root) => {
            visit(tree, "element", (node: Element) => {
              // Only classify anchor elements already identified as internal.
              if (
                node.tagName !== "a" ||
                !node.properties ||
                !node.properties.href ||
                typeof node.properties.href !== "string"
              ) {
                return;
              }

              const existingClasses = node.properties.className;
              const classes: string[] = Array.isArray(existingClasses)
                ? existingClasses.filter((value): value is string => typeof value === "string")
                : [];

              // CrawlLinks should have already added this class.
              if (!classes.includes("internal")) {
                return;
              }

              // CrawlLinks records the resolved destination here.
              const destination = node.properties["data-slug"];

              if (typeof destination !== "string" || !destination) {
                return;
              }

              for (const rule of opts.rules) {
                if (!matchesRule(destination, rule)) {
                  continue;
                }

                const ruleClasses = Array.isArray(rule.className)
                  ? rule.className
                  : [rule.className];

                for (const className of ruleClasses) {
                  if (className.trim() && !classes.includes(className.trim())) {
                    classes.push(className.trim());
                  }
                }
              }

              node.properties.className = classes;
            });
          };
        },
      ];
    },
  };
};
