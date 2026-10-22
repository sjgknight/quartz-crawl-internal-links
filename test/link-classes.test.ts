import { describe, expect, it } from "vitest"
import type { Element, Root } from "hast"
import type { BuildCtx } from "@quartz-community/types"
import { LinkClasses, type LinkClassesOptions } from "../src/transformer"

function makeAnchor(
  href: string,
  slug?: string,
  classes: string[] = ["internal"],
): Element {
  const properties: Element["properties"] = {
    href,
    className: classes,
  }

  if (slug !== undefined) {
    properties["data-slug"] = slug
  }

  return {
    type: "element",
    tagName: "a",
    properties,
    children: [{ type: "text", value: "link" }],
  }
}

function makeTree(...anchors: Element[]): Root {
  return {
    type: "root",
    children: anchors,
  }
}

function runTransform(
  tree: Root,
  opts: Partial<LinkClassesOptions>,
): Root {
  const plugin = LinkClasses(opts)
  const ctx = {} as BuildCtx
  const plugins = plugin.htmlPlugins!(ctx)
  const factory = plugins[0] as () => (tree: Root) => void
  const transformer = factory()

  transformer(tree)

  return tree
}

function classesOf(element: Element): string[] {
  const value = element.properties.className

  return Array.isArray(value)
    ? value.filter(
        (item): item is string => typeof item === "string",
      )
    : []
}

function hasClass(element: Element, className: string): boolean {
  return classesOf(element).includes(className)
}

function firstLink(tree: Root): Element {
  return tree.children[0] as Element
}

describe("LinkClasses", () => {
  it("adds a class to a link inside a configured directory", () => {
    const tree = makeTree(makeAnchor("item", "zotero/item"))

    runTransform(tree, {
      rules: [{ directory: "zotero", className: "link-zotero" }],
    })

    expect(hasClass(firstLink(tree), "link-zotero")).toBe(true)
  })

  it("matches the directory itself", () => {
    const tree = makeTree(makeAnchor("zotero", "zotero"))

    runTransform(tree, {
      rules: [{ directory: "zotero", className: "link-zotero" }],
    })

    expect(hasClass(firstLink(tree), "link-zotero")).toBe(true)
  })

  it("matches nested descendants of a directory", () => {
    const tree = makeTree(makeAnchor("item", "zotero/collections/2026/item"))

    runTransform(tree, {
      rules: [{ directory: "zotero", className: "link-zotero" }],
    })

    expect(hasClass(firstLink(tree), "link-zotero")).toBe(true)
  })

  it("does not match a directory name that only shares a prefix", () => {
    const tree = makeTree(makeAnchor("item", "zotero-archive/item"))

    runTransform(tree, {
      rules: [{ directory: "zotero", className: "link-zotero" }],
    })

    expect(hasClass(firstLink(tree), "link-zotero")).toBe(false)
  })

  it("normalises leading and trailing slashes in directory rules", () => {
    const tree = makeTree(makeAnchor("item", "zotero/item"))

    runTransform(tree, {
      rules: [{ directory: "/zotero/", className: "link-zotero" }],
    })

    expect(hasClass(firstLink(tree), "link-zotero")).toBe(true)
  })

  it("matches a destination by slug prefix", () => {
    const tree = makeTree(makeAnchor("item", "DECRA/research/theory"))

    runTransform(tree, {
      rules: [{ slugPrefix: "DECRA/research", className: "link-research" }],
    })

    expect(hasClass(firstLink(tree), "link-research")).toBe(true)
  })

  it("matches an exact destination slug", () => {
    const tree = makeTree(makeAnchor("index", "tags/index"))

    runTransform(tree, {
      rules: [{ exactSlug: "tags/index", className: "link-tag-index" }],
    })

    expect(hasClass(firstLink(tree), "link-tag-index")).toBe(true)
  })

  it("does not apply an exact-slug rule to a different destination", () => {
    const tree = makeTree(makeAnchor("other", "tags/other"))

    runTransform(tree, {
      rules: [{ exactSlug: "tags/index", className: "link-tag-index" }],
    })

    expect(hasClass(firstLink(tree), "link-tag-index")).toBe(false)
  })

  it("applies multiple matching rules to the same link", () => {
    const tree = makeTree(makeAnchor("index", "tags/index"))

    runTransform(tree, {
      rules: [
        { directory: "tags", className: "link-tag" },
        { exactSlug: "tags/index", className: "link-tag-index" },
      ],
    })

    const link = firstLink(tree)

    expect(hasClass(link, "link-tag")).toBe(true)
    expect(hasClass(link, "link-tag-index")).toBe(true)
  })

  it("supports adding multiple classes from one rule", () => {
    const tree = makeTree(makeAnchor("item", "zotero/item"))

    runTransform(tree, {
      rules: [
        {
          directory: "zotero",
          className: ["link-zotero", "link-reference"],
        },
      ],
    })

    const link = firstLink(tree)

    expect(hasClass(link, "link-zotero")).toBe(true)
    expect(hasClass(link, "link-reference")).toBe(true)
  })

  it("preserves existing classes", () => {
    const tree = makeTree(
      makeAnchor("item", "zotero/item", ["internal", "existing-class"]),
    )

    runTransform(tree, {
      rules: [{ directory: "zotero", className: "link-zotero" }],
    })

    const link = firstLink(tree)

    expect(hasClass(link, "internal")).toBe(true)
    expect(hasClass(link, "existing-class")).toBe(true)
    expect(hasClass(link, "link-zotero")).toBe(true)
  })

  it("does not classify external links", () => {
    const tree = makeTree(
      makeAnchor("https://example.com", undefined, ["external"]),
    )

    runTransform(tree, {
      rules: [{ directory: "zotero", className: "link-zotero" }],
    })

    const link = firstLink(tree)

    expect(hasClass(link, "external")).toBe(true)
    expect(hasClass(link, "link-zotero")).toBe(false)
  })

  it("does not classify links without a resolved data-slug", () => {
    const tree = makeTree(makeAnchor("zotero/item", undefined))

    runTransform(tree, {
      rules: [{ directory: "zotero", className: "link-zotero" }],
    })

    expect(hasClass(firstLink(tree), "link-zotero")).toBe(false)
  })

  it("does not classify links without the internal class", () => {
    const tree = makeTree(
      makeAnchor("zotero/item", "zotero/item", ["some-other-class"]),
    )

    runTransform(tree, {
      rules: [{ directory: "zotero", className: "link-zotero" }],
    })

    expect(hasClass(firstLink(tree), "link-zotero")).toBe(false)
  })

  it("does nothing when no rules are configured", () => {
    const tree = makeTree(makeAnchor("item", "zotero/item"))

    runTransform(tree, { rules: [] })

    expect(classesOf(firstLink(tree))).toEqual(["internal"])
  })

  it("does not add duplicate classes", () => {
    const tree = makeTree(
      makeAnchor("item", "zotero/item", ["internal", "link-zotero"]),
    )

    runTransform(tree, {
      rules: [{ directory: "zotero", className: "link-zotero" }],
    })

    expect(
      classesOf(firstLink(tree)).filter((name) => name === "link-zotero"),
    ).toHaveLength(1)
  })

  it("ignores non-anchor elements", () => {
    const tree: Root = {
      type: "root",
      children: [
        {
          type: "element",
          tagName: "div",
          properties: { className: [] },
          children: [{ type: "text", value: "not a link" }],
        },
      ],
    }

    expect(() =>
      runTransform(tree, {
        rules: [{ directory: "zotero", className: "link-zotero" }],
      }),
    ).not.toThrow()

    expect((tree.children[0] as Element).tagName).toBe("div")
  })
})
