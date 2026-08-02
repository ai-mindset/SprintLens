import { assertEquals, assertFalse, assertStringIncludes } from "@std/assert";
import dashboardHtml from "../index.html" with { type: "text" };

Deno.test("dashboard exposes four focused views with matching navigation", () => {
  const views = [
    ["overview", "Overview"],
    ["sentiment", "Sentiment"],
    ["themes-blockers", "Themes &amp; blockers"],
    ["follow-through", "Follow-through"],
  ];

  for (const [id, label] of views) {
    assertStringIncludes(dashboardHtml, `<a href="#${id}"`);
    assertStringIncludes(dashboardHtml, `>${label}</a>`);
    assertStringIncludes(dashboardHtml, `id="${id}" data-view`);
    assertStringIncludes(dashboardHtml, `<h2 tabindex="-1">${label}</h2>`);
  }

  assertFalse(dashboardHtml.includes('id="evidence"'));
  assertFalse(dashboardHtml.includes('class="back-to-top"'));
});

Deno.test("every dashboard chart has an accessible data alternative", () => {
  const chartIds = [
    "sentiment",
    "sentiment-sprint",
    "themes",
    "blockers",
    "actions",
    "actions-sprint",
  ];

  for (const id of chartIds) {
    assertStringIncludes(dashboardHtml, `id="${id}-chart"`);
    assertStringIncludes(dashboardHtml, `id="${id}-data"`);
  }
});

Deno.test("supporting evidence uses a labelled non-modal inspector", () => {
  assertStringIncludes(
    dashboardHtml,
    'class="detail-inspector" id="detail-inspector" hidden',
  );
  assertStringIncludes(dashboardHtml, 'aria-labelledby="detail-title"');
  assertStringIncludes(dashboardHtml, 'id="detail-close"');
  assertFalse(dashboardHtml.includes("<dialog"));
  assertFalse(dashboardHtml.includes("Math.random"));
});

Deno.test("dashboard element identifiers remain unique", () => {
  const ids = [...dashboardHtml.matchAll(/\sid="([^"]+)"/g)].map((match) =>
    match[1]
  );
  assertEquals(new Set(ids).size, ids.length);
});
