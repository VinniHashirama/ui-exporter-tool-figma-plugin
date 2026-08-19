"use strict";
(() => {
  // src/kit-builder.ts
  var PAGE_NAME = "UI Kit";
  var FONT_FAMILY = "Inter";
  var REGULAR_CANDIDATES = ["Regular", "Medium"];
  var MEDIUM_CANDIDATES = ["Medium", "Regular"];
  var SEMIBOLD_CANDIDATES = ["Semi Bold", "SemiBold", "Medium", "Bold"];
  var BOLD_CANDIDATES = ["Bold", "Semi Bold", "Medium"];
  var PALETTE = {
    background: { r: 0.07, g: 0.08, b: 0.12 },
    surface: { r: 0.16, g: 0.17, b: 0.22 },
    "surface-raised": { r: 0.22, g: 0.23, b: 0.29 },
    primary: { r: 0.05, g: 0.6, b: 1 },
    "primary-muted": { r: 0.3, g: 0.33, b: 0.4 },
    text: { r: 0.95, g: 0.96, b: 0.98 },
    "text-muted": { r: 0.62, g: 0.65, b: 0.72 },
    track: { r: 0.12, g: 0.13, b: 0.17 }
  };
  var SCREEN_TEMPLATE_NAME = "screen/Exemplo";
  var SECTIONS = [
    {
      title: "Containers",
      items: [
        { name: "Panel", build: buildPanel },
        { name: "Window/Modal", build: buildWindow },
        { name: "ScrollView", build: buildScrollView }
      ]
    },
    {
      title: "A\xE7\xF5es",
      items: [
        { name: "Button/Primary", build: (ctx) => buildTextButton(ctx, "primary") },
        { name: "Button/Secondary", build: (ctx) => buildTextButton(ctx, "primary-muted") },
        { name: "Button/Icon", build: buildIconButton }
      ]
    },
    {
      title: "Entrada",
      items: [
        { name: "Toggle/Checkbox", build: buildCheckbox },
        { name: "Slider", build: buildSlider },
        { name: "InputField", build: buildInputField }
      ]
    },
    {
      title: "Exibi\xE7\xE3o",
      items: [
        { name: "Label", build: buildLabel },
        { name: "Icon", build: buildIcon },
        { name: "Image", build: buildImage },
        { name: "ProgressBar", build: buildProgressBar }
      ]
    },
    {
      title: "Navega\xE7\xE3o",
      items: [{ name: "Tabs", build: buildTabs }]
    }
  ];
  var KIT_COMPONENT_NAMES = SECTIONS.flatMap(
    (section) => section.items.map((item) => item.name)
  );
  async function createKit() {
    const result = {
      pageName: PAGE_NAME,
      created: [],
      skipped: [],
      stylesCreated: 0,
      warnings: []
    };
    const fonts = await loadFonts(result);
    const page = await findOrCreatePage(PAGE_NAME);
    const ctx = {
      page,
      fonts,
      colors: /* @__PURE__ */ new Map(),
      texts: /* @__PURE__ */ new Map(),
      result
    };
    await ensureColorStyles(ctx);
    await ensureTextStyles(ctx);
    const existing = collectExistingNames(page);
    const layout = { x: 0, y: 0, rowHeight: 0 };
    const MAX_ROW_WIDTH = 1500;
    const GAP = 64;
    const place = (node) => {
      if (layout.x > 0 && layout.x + node.width > MAX_ROW_WIDTH) {
        layout.x = 0;
        layout.y += layout.rowHeight + GAP;
        layout.rowHeight = 0;
      }
      node.x = layout.x;
      node.y = layout.y;
      layout.x += node.width + GAP;
      layout.rowHeight = Math.max(layout.rowHeight, node.height);
    };
    const section = async (title) => {
      if (layout.x > 0 || layout.rowHeight > 0) {
        layout.y += layout.rowHeight + GAP * 2;
      }
      layout.x = 0;
      layout.rowHeight = 0;
      const heading = figma.createText();
      heading.fontName = ctx.fonts.bold;
      heading.characters = title;
      heading.fontSize = 48;
      heading.fills = [solid(PALETTE["text-muted"])];
      heading.x = 0;
      heading.y = layout.y;
      page.appendChild(heading);
      layout.y += heading.height + GAP;
    };
    await section("Tokens");
    placeSwatches(ctx, place);
    for (const group of SECTIONS) {
      await section(group.title);
      for (const recipe of group.items) {
        if (existing.has(recipe.name)) {
          result.skipped.push(recipe.name);
          continue;
        }
        const node = await recipe.build(ctx);
        node.name = recipe.name;
        page.appendChild(node);
        place(node);
        existing.add(recipe.name);
        result.created.push(recipe.name);
      }
    }
    await buildScreenTemplate(ctx, existing);
    await figma.setCurrentPageAsync(page);
    const focus = page.children.length > 0 ? [page.children[0]] : [];
    if (focus.length > 0) {
      figma.viewport.scrollAndZoomIntoView(focus);
    }
    return result;
  }
  async function loadFonts(result) {
    const regular = await resolveFont(REGULAR_CANDIDATES, result);
    const medium = await resolveFont(MEDIUM_CANDIDATES, result);
    const semibold = await resolveFont(SEMIBOLD_CANDIDATES, result);
    const bold = await resolveFont(BOLD_CANDIDATES, result);
    return { regular, medium, semibold, bold };
  }
  async function resolveFont(candidates, result) {
    for (const style of candidates) {
      const font = { family: FONT_FAMILY, style };
      try {
        await figma.loadFontAsync(font);
        return font;
      } catch {
      }
    }
    result.warnings.push(
      `Nenhum destes pesos do ${FONT_FAMILY} est\xE1 dispon\xEDvel: ${candidates.join(", ")}. Usei o peso padr\xE3o.`
    );
    const fallback = { family: FONT_FAMILY, style: "Regular" };
    await figma.loadFontAsync(fallback);
    return fallback;
  }
  async function findOrCreatePage(name) {
    for (const page2 of figma.root.children) {
      if (page2.name === name) {
        await page2.loadAsync();
        return page2;
      }
    }
    const page = figma.createPage();
    page.name = name;
    return page;
  }
  function collectExistingNames(page) {
    const names = /* @__PURE__ */ new Set();
    for (const node of page.children) {
      if (node.type === "COMPONENT" || node.type === "COMPONENT_SET" || node.type === "FRAME") {
        names.add(node.name);
      }
    }
    return names;
  }
  async function ensureColorStyles(ctx) {
    const existing = /* @__PURE__ */ new Map();
    for (const style of await figma.getLocalPaintStylesAsync()) {
      existing.set(style.name, style);
    }
    for (const key of Object.keys(PALETTE)) {
      const name = `color/${key}`;
      let style = existing.get(name);
      if (style === void 0) {
        style = figma.createPaintStyle();
        style.name = name;
        ctx.result.stylesCreated++;
      }
      style.paints = [solid(PALETTE[key])];
      ctx.colors.set(key, style);
    }
  }
  var TEXT_STYLES = [
    { name: "text/h1", weight: "bold", size: 56, lineHeight: 64 },
    { name: "text/h2", weight: "semibold", size: 40, lineHeight: 48 },
    { name: "text/button", weight: "semibold", size: 32, lineHeight: 40 },
    { name: "text/body", weight: "regular", size: 28, lineHeight: 36 },
    { name: "text/caption", weight: "regular", size: 20, lineHeight: 28 }
  ];
  async function ensureTextStyles(ctx) {
    const existing = /* @__PURE__ */ new Map();
    for (const style of await figma.getLocalTextStylesAsync()) {
      existing.set(style.name, style);
    }
    for (const spec of TEXT_STYLES) {
      let style = existing.get(spec.name);
      if (style === void 0) {
        style = figma.createTextStyle();
        style.name = spec.name;
        ctx.result.stylesCreated++;
      }
      style.fontName = ctx.fonts[spec.weight];
      style.fontSize = spec.size;
      style.lineHeight = { unit: "PIXELS", value: spec.lineHeight };
      ctx.texts.set(spec.name, style);
    }
  }
  function solid(color) {
    return { type: "SOLID", color, opacity: 1 };
  }
  async function applyFillStyle(node, style) {
    try {
      await node.setFillStyleIdAsync(style.id);
    } catch {
      try {
        ;
        node.fillStyleId = style.id;
      } catch {
      }
    }
  }
  async function applyTextStyle(node, style) {
    try {
      await node.setTextStyleIdAsync(style.id);
    } catch {
      try {
        ;
        node.textStyleId = style.id;
      } catch {
      }
    }
  }
  async function text(ctx, name, content, options = {}) {
    const node = figma.createText();
    node.name = name;
    node.fontName = ctx.fonts[options.weight ?? "regular"];
    node.characters = content;
    node.fontSize = options.size ?? 28;
    node.textAlignHorizontal = options.align ?? "CENTER";
    node.textAlignVertical = "CENTER";
    node.fills = [solid(PALETTE[options.color ?? "text"])];
    const styleName = options.style;
    if (styleName !== void 0) {
      const style = ctx.texts.get(styleName);
      if (style !== void 0) {
        await applyTextStyle(node, style);
      }
    }
    return node;
  }
  async function surface(ctx, node, color) {
    node.fills = [solid(PALETTE[color])];
    const style = ctx.colors.get(color);
    if (style !== void 0) {
      await applyFillStyle(node, style);
    }
  }
  function component(name, width, height) {
    const node = figma.createComponent();
    node.name = name;
    node.resizeWithoutConstraints(width, height);
    return node;
  }
  function row(node, spacing, paddingX, paddingY) {
    node.layoutMode = "HORIZONTAL";
    node.itemSpacing = spacing;
    node.paddingLeft = paddingX;
    node.paddingRight = paddingX;
    node.paddingTop = paddingY;
    node.paddingBottom = paddingY;
    node.primaryAxisAlignItems = "CENTER";
    node.counterAxisAlignItems = "CENTER";
  }
  function column(node, spacing, paddingX, paddingY) {
    node.layoutMode = "VERTICAL";
    node.itemSpacing = spacing;
    node.paddingLeft = paddingX;
    node.paddingRight = paddingX;
    node.paddingTop = paddingY;
    node.paddingBottom = paddingY;
    node.primaryAxisAlignItems = "MIN";
    node.counterAxisAlignItems = "MIN";
  }
  function rect(name, width, height, color, radius = 0) {
    const node = figma.createRectangle();
    node.name = name;
    node.resizeWithoutConstraints(width, height);
    node.fills = [solid(color)];
    node.cornerRadius = radius;
    return node;
  }
  function bindProperty(node, key, propertyId, result, label) {
    try {
      node.componentPropertyReferences = { [key]: propertyId };
    } catch {
      result.warnings.push(
        `N\xE3o consegui ligar a propriedade '${label}'. O export continua funcionando pelo texto interno do componente.`
      );
    }
  }
  function addProperty(target, name, type, defaultValue, result) {
    try {
      return target.addComponentProperty(name, type, defaultValue);
    } catch {
      result.warnings.push(`N\xE3o consegui criar a propriedade '${name}' em '${target.name}'.`);
      return null;
    }
  }
  async function buildPanel(ctx) {
    const node = component("Panel", 600, 400);
    column(node, 16, 32, 32);
    node.cornerRadius = 24;
    await surface(ctx, node, "surface");
    const hint = await text(ctx, "Conte\xFAdo", "Conte\xFAdo do painel", {
      style: "text/body",
      color: "text-muted",
      align: "LEFT"
    });
    node.appendChild(hint);
    return node;
  }
  async function buildWindow(ctx) {
    const node = component("Window/Modal", 800, 560);
    column(node, 0, 0, 0);
    node.cornerRadius = 32;
    node.clipsContent = true;
    await surface(ctx, node, "surface");
    const header = figma.createFrame();
    header.name = "Header";
    header.resizeWithoutConstraints(800, 96);
    row(header, 16, 32, 20);
    await surface(ctx, header, "surface-raised");
    node.appendChild(header);
    header.layoutSizingHorizontal = "FILL";
    const title = await text(ctx, "Title", "T\xEDtulo da janela", {
      style: "text/h2",
      align: "LEFT"
    });
    header.appendChild(title);
    title.layoutSizingHorizontal = "FILL";
    const close = figma.createFrame();
    close.name = "Close";
    close.resizeWithoutConstraints(56, 56);
    row(close, 0, 0, 0);
    close.cornerRadius = 28;
    await surface(ctx, close, "primary-muted");
    header.appendChild(close);
    const closeGlyph = await text(ctx, "Glyph", "\u2715", { weight: "semibold", size: 28 });
    close.appendChild(closeGlyph);
    const body = figma.createFrame();
    body.name = "Body";
    body.resizeWithoutConstraints(800, 320);
    column(body, 16, 32, 32);
    body.fills = [];
    node.appendChild(body);
    body.layoutSizingHorizontal = "FILL";
    const bodyHint = await text(ctx, "Conte\xFAdo", "Corpo da janela", {
      style: "text/body",
      color: "text-muted",
      align: "LEFT"
    });
    body.appendChild(bodyHint);
    const footer = figma.createFrame();
    footer.name = "Footer";
    footer.resizeWithoutConstraints(800, 112);
    row(footer, 16, 32, 24);
    footer.primaryAxisAlignItems = "MAX";
    footer.fills = [];
    node.appendChild(footer);
    footer.layoutSizingHorizontal = "FILL";
    const titleProperty = addProperty(node, "title", "TEXT", "T\xEDtulo da janela", ctx.result);
    if (titleProperty !== null) {
      bindProperty(title, "characters", titleProperty, ctx.result, "title");
    }
    return node;
  }
  async function buildScrollView(ctx) {
    const node = component("ScrollView", 600, 700);
    column(node, 0, 0, 0);
    node.cornerRadius = 24;
    node.clipsContent = true;
    await surface(ctx, node, "track");
    const content = figma.createFrame();
    content.name = "Content";
    content.resizeWithoutConstraints(600, 700);
    column(content, 16, 24, 24);
    content.fills = [];
    node.appendChild(content);
    content.layoutSizingHorizontal = "FILL";
    for (let i = 1; i <= 3; i++) {
      const item = figma.createFrame();
      item.name = `Item ${i}`;
      item.resizeWithoutConstraints(552, 96);
      row(item, 12, 24, 24);
      item.cornerRadius = 16;
      await surface(ctx, item, "surface");
      content.appendChild(item);
      item.layoutSizingHorizontal = "FILL";
      const itemLabel = await text(ctx, "Label", `Item ${i}`, {
        style: "text/body",
        align: "LEFT"
      });
      item.appendChild(itemLabel);
      itemLabel.layoutSizingHorizontal = "FILL";
    }
    return node;
  }
  var BUTTON_STATES = ["Default", "Hover", "Pressed", "Disabled"];
  async function buildTextButton(ctx, color) {
    const variants = [];
    const labels = [];
    const iconsLeft = [];
    const iconsRight = [];
    for (const state of BUTTON_STATES) {
      const variant = component(`State=${state}`, 320, 96);
      row(variant, 12, 32, 20);
      variant.cornerRadius = 20;
      variant.layoutSizingHorizontal = "HUG";
      await surface(ctx, variant, state === "Disabled" ? "primary-muted" : color);
      variant.opacity = state === "Disabled" ? 0.5 : 1;
      const iconLeft = rect("IconLeft", 40, 40, PALETTE.text, 8);
      iconLeft.visible = false;
      variant.appendChild(iconLeft);
      iconsLeft.push(iconLeft);
      const label = await text(ctx, "Label", "Bot\xE3o", { style: "text/button" });
      variant.appendChild(label);
      labels.push(label);
      const iconRight = rect("IconRight", 40, 40, PALETTE.text, 8);
      iconRight.visible = false;
      variant.appendChild(iconRight);
      iconsRight.push(iconRight);
      variants.push(variant);
    }
    const set = figma.combineAsVariants(variants, ctx.page);
    const labelProperty = addProperty(set, "label", "TEXT", "Bot\xE3o", ctx.result);
    if (labelProperty !== null) {
      for (const label of labels) {
        bindProperty(label, "characters", labelProperty, ctx.result, "label");
      }
    }
    const leftProperty = addProperty(set, "iconLeft", "BOOLEAN", false, ctx.result);
    if (leftProperty !== null) {
      for (const icon of iconsLeft) {
        bindProperty(icon, "visible", leftProperty, ctx.result, "iconLeft");
      }
    }
    const rightProperty = addProperty(set, "iconRight", "BOOLEAN", false, ctx.result);
    if (rightProperty !== null) {
      for (const icon of iconsRight) {
        bindProperty(icon, "visible", rightProperty, ctx.result, "iconRight");
      }
    }
    return set;
  }
  async function buildIconButton(ctx) {
    const variants = [];
    for (const state of BUTTON_STATES) {
      const variant = component(`State=${state}`, 96, 96);
      row(variant, 0, 20, 20);
      variant.cornerRadius = 20;
      await surface(ctx, variant, "primary-muted");
      variant.opacity = state === "Disabled" ? 0.5 : 1;
      const icon = rect("Icon", 56, 56, PALETTE.text, 8);
      variant.appendChild(icon);
      variants.push(variant);
    }
    return figma.combineAsVariants(variants, ctx.page);
  }
  async function buildCheckbox(ctx) {
    const variants = [];
    const labels = [];
    for (const checked of ["On", "Off"]) {
      const variant = component(`Checked=${checked}`, 360, 56);
      row(variant, 16, 0, 0);
      variant.primaryAxisAlignItems = "MIN";
      variant.layoutSizingHorizontal = "HUG";
      variant.fills = [];
      const box = figma.createFrame();
      box.name = "Box";
      box.resizeWithoutConstraints(48, 48);
      row(box, 0, 8, 8);
      box.cornerRadius = 12;
      await surface(ctx, box, "track");
      variant.appendChild(box);
      const checkmark = rect("Checkmark", 28, 28, PALETTE.primary, 6);
      checkmark.visible = checked === "On";
      box.appendChild(checkmark);
      const label = await text(ctx, "Label", "Op\xE7\xE3o", { style: "text/body", align: "LEFT" });
      variant.appendChild(label);
      labels.push(label);
      variants.push(variant);
    }
    const set = figma.combineAsVariants(variants, ctx.page);
    const labelProperty = addProperty(set, "label", "TEXT", "Op\xE7\xE3o", ctx.result);
    if (labelProperty !== null) {
      for (const label of labels) {
        bindProperty(label, "characters", labelProperty, ctx.result, "label");
      }
    }
    return set;
  }
  async function buildSlider(ctx) {
    const node = component("Slider", 400, 48);
    node.fills = [];
    const track = rect("Background", 400, 12, PALETTE.track, 6);
    track.y = 18;
    node.appendChild(track);
    await surface(ctx, track, "track");
    const fill = rect("Fill", 200, 12, PALETTE.primary, 6);
    fill.y = 18;
    node.appendChild(fill);
    await surface(ctx, fill, "primary");
    const handle = figma.createEllipse();
    handle.name = "Handle";
    handle.resizeWithoutConstraints(44, 44);
    handle.x = 178;
    handle.y = 2;
    handle.fills = [solid(PALETTE.text)];
    node.appendChild(handle);
    return node;
  }
  async function buildInputField(ctx) {
    const node = component("InputField", 480, 80);
    row(node, 0, 24, 20);
    node.primaryAxisAlignItems = "MIN";
    node.cornerRadius = 16;
    await surface(ctx, node, "track");
    const placeholder = await text(ctx, "Placeholder", "Digite aqui...", {
      style: "text/body",
      color: "text-muted",
      align: "LEFT"
    });
    node.appendChild(placeholder);
    placeholder.layoutSizingHorizontal = "FILL";
    return node;
  }
  async function buildLabel(ctx) {
    const node = component("Label", 320, 40);
    row(node, 0, 0, 0);
    node.layoutSizingHorizontal = "HUG";
    node.layoutSizingVertical = "HUG";
    node.fills = [];
    const label = await text(ctx, "Text", "Texto", { style: "text/body", align: "LEFT" });
    node.appendChild(label);
    const property = addProperty(node, "text", "TEXT", "Texto", ctx.result);
    if (property !== null) {
      bindProperty(label, "characters", property, ctx.result, "text");
    }
    return node;
  }
  async function buildIcon(ctx) {
    const node = component("Icon", 64, 64);
    node.fills = [];
    const glyph = rect("Glyph", 64, 64, PALETTE.text, 12);
    node.appendChild(glyph);
    await surface(ctx, glyph, "text");
    return node;
  }
  async function buildImage(ctx) {
    const node = component("Image", 240, 180);
    node.fills = [];
    const placeholder = rect("Placeholder", 240, 180, PALETTE["surface-raised"], 12);
    node.appendChild(placeholder);
    const hint = await text(ctx, "Hint", "imagem", {
      style: "text/caption",
      color: "text-muted"
    });
    hint.x = 90;
    hint.y = 78;
    node.appendChild(hint);
    return node;
  }
  async function buildProgressBar(ctx) {
    const node = component("ProgressBar", 400, 32);
    node.fills = [];
    const track = rect("Background", 400, 32, PALETTE.track, 16);
    node.appendChild(track);
    await surface(ctx, track, "track");
    const fill = rect("Fill", 240, 32, PALETTE.primary, 16);
    node.appendChild(fill);
    await surface(ctx, fill, "primary");
    return node;
  }
  async function buildTabs(ctx) {
    const node = component("Tabs", 600, 72);
    row(node, 8, 0, 0);
    node.fills = [];
    for (let i = 0; i < 2; i++) {
      const tab = figma.createFrame();
      tab.name = `Tab${i + 1}`;
      tab.resizeWithoutConstraints(296, 72);
      row(tab, 0, 24, 16);
      tab.cornerRadius = 16;
      await surface(ctx, tab, i === 0 ? "primary" : "primary-muted");
      node.appendChild(tab);
      tab.layoutSizingHorizontal = "FILL";
      const label = await text(ctx, "Label", `Aba ${i + 1}`, { style: "text/body" });
      tab.appendChild(label);
    }
    return node;
  }
  async function buildScreenTemplate(ctx, existing) {
    const name = SCREEN_TEMPLATE_NAME;
    if (existing.has(name)) {
      ctx.result.skipped.push(name);
      return;
    }
    const screen = figma.createFrame();
    screen.name = name;
    screen.resizeWithoutConstraints(1080, 1920);
    await surface(ctx, screen, "background");
    screen.clipsContent = true;
    screen.x = 1700;
    screen.y = 0;
    ctx.page.appendChild(screen);
    const safeArea = figma.createFrame();
    safeArea.name = "SafeArea";
    safeArea.resizeWithoutConstraints(1080, 1760);
    safeArea.x = 0;
    safeArea.y = 80;
    safeArea.fills = [];
    safeArea.constraints = { horizontal: "STRETCH", vertical: "STRETCH" };
    screen.appendChild(safeArea);
    const hint = await text(
      ctx,
      "_instrucoes",
      "Duplique este frame e renomeie para screen/NomeDaTela.\nLayers com _ na frente s\xE3o ignoradas no export.",
      { style: "text/body", color: "text-muted", align: "LEFT" }
    );
    hint.x = 64;
    hint.y = 160;
    hint.resizeWithoutConstraints(952, 100);
    safeArea.appendChild(hint);
    ctx.result.created.push(name);
  }
  function placeSwatches(ctx, place) {
    const group = figma.createFrame();
    group.name = "_tokens de cor";
    group.layoutMode = "HORIZONTAL";
    group.itemSpacing = 16;
    group.paddingLeft = 0;
    group.paddingRight = 0;
    group.paddingTop = 0;
    group.paddingBottom = 0;
    group.fills = [];
    group.resizeWithoutConstraints(1200, 120);
    for (const key of Object.keys(PALETTE)) {
      const swatch = rect(`color/${key}`, 120, 120, PALETTE[key], 16);
      group.appendChild(swatch);
    }
    group.layoutSizingHorizontal = "HUG";
    group.layoutSizingVertical = "HUG";
    ctx.page.appendChild(group);
    place(group);
  }

  // src/diagnostics.ts
  var RULES = {
    // Erros: bloqueiam o export.
    emptySelection: "empty-selection",
    rootFrameName: "root-frame-name",
    duplicateBind: "duplicate-bind",
    invalidBind: "invalid-bind",
    // Avisos: passam, mas alguem paga depois.
    defaultLayerName: "default-layer-name",
    unknownComponent: "unknown-component",
    unsupportedEffect: "unsupported-effect",
    complexVector: "complex-vector",
    hardcodedColor: "hardcoded-color",
    hardcodedTypography: "hardcoded-typography",
    spaceBetween: "space-between",
    layoutWrap: "layout-wrap",
    rotatedNode: "rotated-node",
    detachedInstance: "detached-instance",
    mixedTextStyles: "mixed-text-styles",
    unsupportedTextCase: "unsupported-text-case",
    multipleFills: "multiple-fills",
    mixedFills: "mixed-fills",
    emptyScreen: "empty-screen"
  };
  var DiagnosticBag = class {
    constructor() {
      this.items = [];
      this.seen = /* @__PURE__ */ new Set();
    }
    add(severity, rule, message, node) {
      const key = `${rule}|${node?.id ?? "-"}`;
      if (this.seen.has(key)) return;
      this.seen.add(key);
      const item = { severity, rule, message };
      if (node !== void 0) {
        item.nodeId = node.id;
        item.nodeName = node.name;
      }
      this.items.push(item);
    }
    error(rule, message, node) {
      this.add("error", rule, message, node);
    }
    warn(rule, message, node) {
      this.add("warning", rule, message, node);
    }
    info(rule, message, node) {
      this.add("info", rule, message, node);
    }
    get all() {
      return this.items;
    }
    get hasErrors() {
      return this.items.some((item) => item.severity === "error");
    }
    /** Erros primeiro, depois avisos, depois info. Ordem estavel dentro de cada nivel. */
    sorted() {
      const rank = { error: 0, warning: 1, info: 2 };
      return [...this.items].sort((a, b) => rank[a.severity] - rank[b.severity]);
    }
  };

  // src/kit.ts
  var KIT_V1 = [
    // Containers
    "Screen",
    "Panel",
    "Window/Modal",
    "ScrollView",
    // Acoes
    "Button/Primary",
    "Button/Secondary",
    "Button/Icon",
    // Entrada
    "Toggle/Checkbox",
    "Slider",
    "InputField",
    // Exibicao
    "Label",
    "Icon",
    "Image",
    "ProgressBar",
    // Navegacao
    "Tabs"
  ];
  var KIT_SET = new Set(KIT_V1);
  var KIT_FAMILIES = new Set(
    KIT_V1.map((name) => name.split("/")[0])
  );
  function isKnownComponent(canonicalName) {
    return KIT_SET.has(canonicalName);
  }
  function looksLikeKitName(canonicalName) {
    if (KIT_SET.has(canonicalName)) return true;
    const family = canonicalName.split("/")[0];
    return family !== void 0 && KIT_FAMILIES.has(family);
  }
  var LABEL_PROPERTY_NAMES = ["label", "text", "title", "caption"];

  // src/naming.ts
  var LOC_SUFFIX = /:([A-Za-z0-9_.-]+)$/;
  var IMG_SUFFIX = /#img$/i;
  var SCREEN_PREFIX = /^screen\/([A-Za-z][A-Za-z0-9_]*)$/;
  var BIND_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
  var CANONICAL_PATTERN = /^[A-Za-z][A-Za-z0-9]*(\/[A-Za-z][A-Za-z0-9]*)*$/;
  var DISALLOWED_NAME_CHARS = /[^\p{L}\p{N} ._()-]/gu;
  var MAX_NAME_LENGTH = 64;
  function parseName(raw) {
    let working = raw.trim();
    if (working.startsWith("_")) {
      return { clean: sanitizeName(working), bind: null, flatten: false, locKey: null, ignored: true };
    }
    let locKey = null;
    let flatten = false;
    for (let pass = 0; pass < 2; pass++) {
      const loc = working.match(LOC_SUFFIX);
      if (loc?.[1] !== void 0) {
        locKey = loc[1];
        working = working.replace(LOC_SUFFIX, "").trim();
        continue;
      }
      if (IMG_SUFFIX.test(working)) {
        flatten = true;
        working = working.replace(IMG_SUFFIX, "").trim();
        continue;
      }
      break;
    }
    let bind = null;
    if (working.startsWith("@")) {
      const candidate = working.slice(1).trim();
      bind = candidate.length > 0 ? candidate : null;
      working = candidate;
    }
    return { clean: sanitizeName(working), bind, flatten, locKey, ignored: false };
  }
  function isValidBind(bind) {
    return BIND_PATTERN.test(bind);
  }
  function parseScreenName(raw) {
    return raw.trim().match(SCREEN_PREFIX)?.[1] ?? null;
  }
  function sanitizeName(raw) {
    const cleaned = raw.replace(DISALLOWED_NAME_CHARS, " ").replace(/\s+/g, " ").trim().replace(/[.\s]+$/, "").slice(0, MAX_NAME_LENGTH).trim();
    return cleaned.length > 0 ? cleaned : "Node";
  }
  function toAssetId(name, nodeId) {
    const base = name.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
    const suffix = nodeId.replace(/[^A-Za-z0-9]+/g, "-");
    return `${base.length > 0 ? base : "asset"}_${suffix}`;
  }
  function toTokenRef(styleName) {
    const ref = styleName.trim().replace(/\s*\/\s*/g, ".").replace(/\s+/g, "-").replace(/[^A-Za-z0-9_.-]+/g, "").replace(/^[.-]+|[.-]+$/g, "");
    return ref.length > 0 ? ref : null;
  }
  var DEFAULT_NAME_NUMBERED = /^(frame|group|rectangle|ellipse|line|star|polygon|component|instance|slice|text|image)\s+\d+$/i;
  var DEFAULT_NAME_BARE = /^(vector|union|subtract|intersect|exclude)$/i;
  function isDefaultLayerName(raw) {
    const name = raw.trim();
    return DEFAULT_NAME_NUMBERED.test(name) || DEFAULT_NAME_BARE.test(name);
  }
  function normalizeCanonicalName(raw) {
    const segments = raw.split("/").map((segment) => toPascalCase(segment)).filter((segment) => segment.length > 0);
    if (segments.length === 0) return null;
    const joined = segments.join("/");
    return CANONICAL_PATTERN.test(joined) ? joined : null;
  }
  function toPascalCase(raw) {
    return raw.trim().split(/[\s_-]+/).map((word) => word.replace(/[^A-Za-z0-9]/g, "")).filter((word) => word.length > 0).map((word) => /^[A-Z]/.test(word) ? word : word[0].toUpperCase() + word.slice(1)).join("");
  }

  // src/tokens.ts
  var TokenCollector = class {
    constructor() {
      this.nameCache = /* @__PURE__ */ new Map();
      this.colors = /* @__PURE__ */ new Map();
      this.typography = /* @__PURE__ */ new Map();
    }
    async colorToken(styleId, value) {
      const ref = await this.resolve(styleId);
      if (ref === null) return void 0;
      this.colors.set(ref, value);
      return ref;
    }
    async typographyToken(styleId, value) {
      const ref = await this.resolve(styleId);
      if (ref === null) return void 0;
      this.typography.set(ref, value);
      return ref;
    }
    /** Retorna undefined quando nao ha nenhum token — o campo fica fora do JSON. */
    build() {
      const tokens = {};
      if (this.colors.size > 0) tokens.colors = sortedRecord(this.colors);
      if (this.typography.size > 0) tokens.typography = sortedRecord(this.typography);
      return this.colors.size + this.typography.size > 0 ? tokens : void 0;
    }
    async resolve(styleId) {
      if (typeof styleId !== "string" || styleId.length === 0) return null;
      const cached = this.nameCache.get(styleId);
      if (cached !== void 0) return cached;
      let ref = null;
      try {
        const style = await figma.getStyleByIdAsync(styleId);
        ref = style !== null ? toTokenRef(style.name) : null;
      } catch {
        ref = null;
      }
      this.nameCache.set(styleId, ref);
      return ref;
    }
  };
  function sortedRecord(map) {
    const out = {};
    for (const key of [...map.keys()].sort()) {
      out[key] = map.get(key);
    }
    return out;
  }

  // src/uiir.ts
  var SCHEMA_VERSION = "1.0.0";
  var PLUGIN_VERSION = "0.1.0";

  // src/mappers/color.ts
  function rgbToHex(color, alpha = 1) {
    const hex = `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`;
    const a = clamp01(alpha);
    return a >= 1 ? hex : `${hex}${channel(a)}`;
  }
  function channel(value) {
    return Math.round(clamp01(value) * 255).toString(16).padStart(2, "0");
  }
  function clamp01(value) {
    if (!Number.isFinite(value)) return 0;
    return value < 0 ? 0 : value > 1 ? 1 : value;
  }

  // src/mappers/geometry.ts
  function relativeRect(node, parent) {
    const box = "absoluteBoundingBox" in node ? node.absoluteBoundingBox : null;
    const parentBox = parent !== null && "absoluteBoundingBox" in parent ? parent.absoluteBoundingBox : null;
    if (box !== null && parentBox !== null) {
      return {
        x: round(box.x - parentBox.x),
        y: round(box.y - parentBox.y),
        width: round(node.width),
        height: round(node.height)
      };
    }
    return {
      x: round("x" in node ? node.x : 0),
      y: round("y" in node ? node.y : 0),
      width: round(node.width),
      height: round(node.height)
    };
  }
  function rootRect(node) {
    return { x: 0, y: 0, width: round(node.width), height: round(node.height) };
  }
  function mapConstraints(node) {
    if (!("constraints" in node)) return void 0;
    const { horizontal, vertical } = node.constraints;
    return { horizontal, vertical };
  }
  function mapCornerRadius(node) {
    if (!("cornerRadius" in node)) return void 0;
    const uniform = node.cornerRadius;
    if (typeof uniform === "number") {
      if (uniform <= 0) return void 0;
      const r = round(uniform);
      return [r, r, r, r];
    }
    const corners = [
      round(readCorner(node, "topLeftRadius")),
      round(readCorner(node, "topRightRadius")),
      round(readCorner(node, "bottomRightRadius")),
      round(readCorner(node, "bottomLeftRadius"))
    ];
    return corners.some((value) => value > 0) ? corners : void 0;
  }
  function readCorner(node, key) {
    const value = node[key];
    return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
  }
  function round(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.round(value * 100) / 100;
  }

  // src/mappers/fill.ts
  function hasImagePaint(node) {
    if (!("fills" in node)) return false;
    const fills = node.fills;
    if (!Array.isArray(fills)) return false;
    return fills.some(
      (paint) => paint.visible !== false && (paint.type === "IMAGE" || paint.type === "VIDEO")
    );
  }
  function hasVisibleEffect(node) {
    if (!("effects" in node)) return false;
    const effects = node.effects;
    if (!Array.isArray(effects)) return false;
    return effects.some((effect) => effect.visible !== false);
  }
  function hasGradientPaint(node) {
    if (!("fills" in node)) return false;
    const fills = node.fills;
    if (!Array.isArray(fills)) return false;
    return fills.some((paint) => paint.visible !== false && paint.type.startsWith("GRADIENT_"));
  }
  async function mapFill(node, bag, tokens) {
    if (!("fills" in node)) return void 0;
    const fills = node.fills;
    if (!Array.isArray(fills)) {
      bag.warn(RULES.mixedFills, "Node com fills mistos: nenhum fundo foi exportado.", node);
      return void 0;
    }
    const visible = fills.filter((paint2) => paint2.visible !== false);
    if (visible.length === 0) return void 0;
    if (visible.length > 1) {
      bag.warn(
        RULES.multipleFills,
        `${visible.length} fills empilhados; UGUI suporta um. Apenas o de cima foi exportado \u2014 achate em PNG com "#img" se a pilha importa.`,
        node
      );
    }
    const paint = visible[visible.length - 1];
    if (paint.type === "SOLID") {
      const color = rgbToHex(paint.color, paint.opacity ?? 1);
      const fill = { type: "SOLID", color };
      const styleId = "fillStyleId" in node ? node.fillStyleId : void 0;
      const token = await tokens.colorToken(styleId, color);
      if (token !== void 0) {
        fill.token = token;
      } else {
        bag.warn(
          RULES.hardcodedColor,
          "Cor fora de token. Use um estilo de cor da Library para a paleta do jogo poder mudar sem editar cada layer.",
          node
        );
      }
      return fill;
    }
    if (paint.type.startsWith("GRADIENT_")) {
      const stops = "gradientStops" in paint ? paint.gradientStops : void 0;
      const first = stops?.[0];
      const color = first !== void 0 ? rgbToHex(first.color, first.color.a) : "#00000000";
      bag.warn(
        RULES.unsupportedEffect,
        `Gradiente nao e reconstruido: virou a cor chapada ${color}. Marque a layer com "#img" para sair fiel ao desenho.`,
        node
      );
      return { type: "SOLID", color };
    }
    bag.warn(
      RULES.unsupportedEffect,
      `Fill do tipo ${paint.type} nao e suportado. Marque a layer com "#img".`,
      node
    );
    return void 0;
  }
  async function mapStroke(node, tokens) {
    if (!("strokes" in node)) return void 0;
    const strokes = node.strokes;
    if (!Array.isArray(strokes)) return void 0;
    const paint = strokes.find((item) => item.visible !== false);
    if (paint === void 0 || paint.type !== "SOLID") return void 0;
    const weight = readStrokeWeight(node);
    if (weight <= 0) return void 0;
    const color = rgbToHex(paint.color, paint.opacity ?? 1);
    const stroke = { color, weight: round(weight) };
    if ("strokeAlign" in node) stroke.align = node.strokeAlign;
    const styleId = "strokeStyleId" in node ? node.strokeStyleId : void 0;
    const token = await tokens.colorToken(styleId, color);
    if (token !== void 0) stroke.token = token;
    return stroke;
  }
  function readStrokeWeight(node) {
    if (!("strokeWeight" in node)) return 0;
    const weight = node.strokeWeight;
    if (typeof weight === "number") return weight;
    const top = node["strokeTopWeight"];
    return typeof top === "number" ? top : 0;
  }

  // src/mappers/component.ts
  async function mapComponent(node, bag) {
    let main = null;
    try {
      main = await node.getMainComponentAsync();
    } catch {
      main = null;
    }
    if (main === null) {
      bag.warn(
        RULES.unknownComponent,
        "Instancia sem componente de origem acessivel. Na Unity vira caixa generica, sem comportamento.",
        node
      );
      return void 0;
    }
    const set = main.parent?.type === "COMPONENT_SET" ? main.parent : null;
    const rawName = set !== null ? set.name : main.name;
    const canonicalName = normalizeCanonicalName(rawName);
    if (canonicalName === null) {
      bag.warn(
        RULES.unknownComponent,
        `Nome de componente "${rawName}" nao pode ser normalizado. Use nomes como "Button/Primary".`,
        node
      );
      return void 0;
    }
    if (!isKnownComponent(canonicalName)) {
      bag.warn(
        RULES.unknownComponent,
        `"${canonicalName}" nao esta no kit v1. Na Unity vira caixa generica, sem comportamento \u2014 peca o componente ao dono da Library.`,
        node
      );
    }
    const component2 = { canonicalName };
    const key = set !== null ? set.key : main.key;
    if (typeof key === "string" && key.length > 0) component2.setKey = key;
    const properties = readProperties(node);
    if (!hasLabel(properties)) {
      const inner = findFirstText(node);
      if (inner !== null) properties["label"] = inner;
    }
    if (Object.keys(properties).length > 0) component2.properties = properties;
    return component2;
  }
  function readProperties(node) {
    const out = {};
    let raw;
    try {
      raw = node.componentProperties;
    } catch {
      return out;
    }
    if (raw === null || typeof raw !== "object") return out;
    for (const [rawKey, entry] of Object.entries(raw)) {
      const key = rawKey.split("#")[0]?.trim();
      if (key === void 0 || key.length === 0) continue;
      const value = entry?.value;
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        out[key] = value;
      }
    }
    return out;
  }
  function hasLabel(properties) {
    const keys = Object.keys(properties).map((key) => key.toLowerCase());
    return LABEL_PROPERTY_NAMES.some((name) => keys.includes(name));
  }
  function findFirstText(node) {
    if (node.visible === false) return null;
    if (node.type === "TEXT") {
      const value = node.characters.trim();
      return value.length > 0 ? value : null;
    }
    if (!("children" in node)) return null;
    for (const child of node.children) {
      if (child.type === "INSTANCE") continue;
      const found = findFirstText(child);
      if (found !== null) return found;
    }
    return null;
  }

  // src/mappers/layout.ts
  function hasAutoLayout(node) {
    return "layoutMode" in node && node.layoutMode !== "NONE";
  }
  function mapLayout(node, bag) {
    if (!hasAutoLayout(node)) return void 0;
    const wrapped = node.layoutWrap === "WRAP";
    const mode = wrapped ? "WRAP" : node.layoutMode === "VERTICAL" ? "VERTICAL" : "HORIZONTAL";
    if (wrapped) {
      bag.warn(
        RULES.layoutWrap,
        "Wrap nao tem equivalente em UGUI: vira grade de celulas iguais. Se os itens tem tamanhos diferentes, o resultado nao vai bater.",
        node
      );
    }
    if (node.primaryAxisAlignItems === "SPACE_BETWEEN") {
      bag.warn(
        RULES.spaceBetween,
        'Space between e aproximado com espacadores em UGUI. Prefira "Fill container" em um dos itens.',
        node
      );
    }
    const padding = [
      round(node.paddingTop),
      round(node.paddingRight),
      round(node.paddingBottom),
      round(node.paddingLeft)
    ];
    const layout = {
      mode,
      padding,
      spacing: round(node.itemSpacing),
      primaryAlign: node.primaryAxisAlignItems,
      counterAlign: node.counterAxisAlignItems,
      sizing: readSizing(node)
    };
    if (node.itemReverseZIndex === true) layout.reverseZIndex = true;
    return layout;
  }
  function mapLayoutChild(node) {
    const child = { sizing: readSizing(node) };
    const grow = "layoutGrow" in node ? node.layoutGrow : 0;
    if (typeof grow === "number" && grow > 0) child.grow = grow;
    return child;
  }
  function readSizing(node) {
    return {
      horizontal: readSizingAxis(node, "layoutSizingHorizontal"),
      vertical: readSizingAxis(node, "layoutSizingVertical")
    };
  }
  function readSizingAxis(node, key) {
    try {
      const value = node[key];
      if (value === "FIXED" || value === "HUG" || value === "FILL") return value;
    } catch {
    }
    return "FIXED";
  }

  // src/mappers/text.ts
  var SEGMENT_FIELDS = [
    "fontName",
    "fontSize",
    "lineHeight",
    "letterSpacing",
    "fills",
    "textCase",
    "textDecoration"
  ];
  async function mapText(node, bag, tokens, locKey) {
    const segment = readPrimarySegment(node, bag);
    const font = readFont(segment.fontName);
    const size = typeof segment.fontSize === "number" ? round(segment.fontSize) : 16;
    const color = readColor(segment.fills);
    const text2 = {
      characters: node.characters,
      font,
      size,
      alignHorizontal: node.textAlignHorizontal,
      alignVertical: node.textAlignVertical,
      color
    };
    const lineHeight = mapLineHeight(segment.lineHeight);
    if (lineHeight !== void 0) text2.lineHeight = lineHeight;
    const letterSpacing = mapLetterSpacing(segment.letterSpacing);
    if (letterSpacing !== void 0) text2.letterSpacing = letterSpacing;
    const autoResize = mapAutoResize(node.textAutoResize);
    if (autoResize !== "NONE") text2.autoResize = autoResize;
    if (typeof node.maxLines === "number" && node.maxLines >= 1) text2.maxLines = node.maxLines;
    if (node.textTruncation === "ENDING") text2.truncation = "ELLIPSIS";
    const textCase = mapTextCase(segment.textCase, node, bag);
    if (textCase !== "ORIGINAL") text2.case = textCase;
    if (segment.textDecoration === "UNDERLINE" || segment.textDecoration === "STRIKETHROUGH") {
      text2.decoration = segment.textDecoration;
    }
    if (locKey !== null) text2.locKey = locKey;
    const styleId = node.textStyleId;
    const token = await tokens.typographyToken(styleId, {
      family: font.family,
      style: font.style,
      size,
      ...lineHeight !== void 0 ? { lineHeight } : {},
      ...letterSpacing !== void 0 ? { letterSpacing: letterSpacing.value } : {}
    });
    if (token !== void 0) {
      text2.token = token;
    } else {
      bag.warn(
        RULES.hardcodedTypography,
        "Estilo de texto fora de token. Use um estilo da Library para o mapeamento de fonte na Unity ser previsivel.",
        node
      );
    }
    return text2;
  }
  function readPrimarySegment(node, bag) {
    let segments = [];
    try {
      segments = node.getStyledTextSegments([...SEGMENT_FIELDS]);
    } catch {
      segments = [];
    }
    if (segments.length > 1) {
      bag.warn(
        RULES.mixedTextStyles,
        `Texto com ${segments.length} formatacoes diferentes; TextMeshPro usa uma. Valeu a do primeiro trecho \u2014 separe em layers se a diferenca importa.`,
        node
      );
    }
    const first = segments[0];
    if (first !== void 0) return first;
    return {
      characters: node.characters,
      fontName: node.fontName,
      fontSize: node.fontSize,
      lineHeight: node.lineHeight,
      letterSpacing: node.letterSpacing,
      fills: node.fills,
      textCase: node.textCase,
      textDecoration: node.textDecoration
    };
  }
  function readFont(fontName) {
    if (typeof fontName === "object" && fontName !== null && "family" in fontName) {
      return { family: fontName.family, style: fontName.style };
    }
    return { family: "Inter", style: "Regular" };
  }
  function readColor(fills) {
    if (!Array.isArray(fills)) return "#000000";
    const paint = fills.find((item) => item.visible !== false);
    if (paint === void 0 || paint.type !== "SOLID") return "#000000";
    return rgbToHex(paint.color, paint.opacity ?? 1);
  }
  function mapLineHeight(value) {
    if (typeof value !== "object" || value === null) return void 0;
    if (value.unit === "AUTO") return { unit: "AUTO" };
    if (value.unit === "PIXELS" || value.unit === "PERCENT") {
      return { unit: value.unit, value: round(value.value) };
    }
    return void 0;
  }
  function mapLetterSpacing(value) {
    if (typeof value !== "object" || value === null) return void 0;
    if (value.unit !== "PIXELS" && value.unit !== "PERCENT") return void 0;
    if (value.value === 0) return void 0;
    return { unit: value.unit, value: round(value.value) };
  }
  function mapAutoResize(value) {
    if (value === "HEIGHT" || value === "WIDTH_AND_HEIGHT") return value;
    return "NONE";
  }
  function mapTextCase(value, node, bag) {
    if (value === "UPPER" || value === "LOWER" || value === "TITLE") return value;
    if (typeof value === "string" && value.startsWith("SMALL_CAPS")) {
      bag.warn(
        RULES.unsupportedTextCase,
        "Small caps nao existe em TextMeshPro: exportado como maiuscula.",
        node
      );
      return "UPPER";
    }
    return "ORIGINAL";
  }

  // src/traverse.ts
  var VECTOR_LIKE = /* @__PURE__ */ new Set([
    "VECTOR",
    "STAR",
    "POLYGON",
    "LINE",
    "ELLIPSE",
    "BOOLEAN_OPERATION"
  ]);
  var NON_UI = /* @__PURE__ */ new Set([
    "SLICE",
    "CONNECTOR",
    "STICKY",
    "SHAPE_WITH_TEXT",
    "CODE_BLOCK",
    "WIDGET",
    "EMBED",
    "LINK_UNFURL",
    "MEDIA",
    "SECTION",
    "TABLE",
    "TABLE_CELL",
    "STAMP",
    "HIGHLIGHT",
    "WASHI_TAPE"
  ]);
  async function build(selection, opts) {
    const bag = new DiagnosticBag();
    const ctx = {
      bag,
      tokens: new TokenCollector(),
      assets: [],
      packed: [],
      binds: /* @__PURE__ */ new Map(),
      opts,
      counts: { nodes: 0, components: 0 }
    };
    const empty = (screenName2 = null) => ({
      ir: null,
      screenName: screenName2,
      assets: [],
      bag,
      nodeCount: 0,
      bindCount: 0,
      componentCount: 0
    });
    if (selection.length === 0) {
      bag.error(RULES.emptySelection, 'Selecione o frame da tela (aquele chamado "screen/...").');
      return empty();
    }
    if (selection.length > 1) {
      bag.error(
        RULES.emptySelection,
        `${selection.length} objetos selecionados. Exporte um frame de tela por vez.`
      );
      return empty();
    }
    const root = selection[0];
    if (root.type !== "FRAME" && root.type !== "COMPONENT") {
      bag.error(
        RULES.rootFrameName,
        `A selecao e do tipo ${root.type}. A raiz da tela precisa ser um Frame.`,
        root
      );
      return empty();
    }
    const screenName = parseScreenName(root.name);
    if (screenName === null) {
      bag.error(
        RULES.rootFrameName,
        `Frame raiz "${root.name}" fora do padrao. Renomeie para "screen/NomeDaTela" (PascalCase, sem espaco).`,
        root
      );
      return empty();
    }
    if (!("children" in root) || root.children.length === 0) {
      bag.warn(RULES.emptyScreen, "A tela nao tem nenhuma layer dentro.", root);
    }
    const irRoot = await visit(root, null, ctx, { parentHasLayout: false, isRoot: true });
    if (irRoot === null) {
      bag.error(RULES.emptySelection, "A tela ficou vazia depois de aplicar as convencoes.");
      return empty(screenName);
    }
    const canvas = {
      width: round(root.width),
      height: round(root.height),
      orientation: root.width > root.height ? "landscape" : "portrait"
    };
    const ir = {
      schemaVersion: SCHEMA_VERSION,
      source: readSource(),
      canvas,
      assets: ctx.assets,
      lint: bag.sorted(),
      root: irRoot
    };
    const tokens = ctx.tokens.build();
    if (tokens !== void 0) ir.tokens = tokens;
    return {
      ir,
      screenName,
      assets: ctx.packed,
      bag,
      nodeCount: ctx.counts.nodes,
      bindCount: ctx.binds.size,
      componentCount: ctx.counts.components
    };
  }
  async function visit(node, parent, ctx, { parentHasLayout, isRoot }) {
    if (NON_UI.has(node.type)) return null;
    const parsed = parseName(node.name);
    if (parsed.ignored) return null;
    const name = isRoot ? parseScreenName(node.name) ?? parsed.clean : parsed.clean;
    const kind = classify(node, parsed.flatten);
    if (kind === null) return null;
    reportNodeIssues(node, kind, parsed.flatten, isRoot, ctx);
    const irNode = {
      id: node.id,
      name,
      kind,
      rect: isRoot ? rootRect(node) : relativeRect(node, parent)
    };
    if ("rotation" in node && Math.abs(node.rotation) > 0.01) {
      irNode.rotation = round(node.rotation);
    }
    if ("opacity" in node && node.opacity < 1) {
      irNode.opacity = round(node.opacity);
    }
    if (node.visible === false) {
      irNode.visible = false;
    }
    if ("clipsContent" in node && node.clipsContent) {
      irNode.clip = true;
    }
    if (!parentHasLayout && !isRoot) {
      const constraints = mapConstraints(node);
      if (constraints !== void 0) irNode.constraints = constraints;
    }
    if (parentHasLayout) {
      irNode.layoutChild = mapLayoutChild(node);
    }
    applyBind(node, parsed.bind, irNode, ctx);
    switch (kind) {
      case "text": {
        irNode.text = await mapText(node, ctx.bag, ctx.tokens, parsed.locKey);
        break;
      }
      case "instance": {
        const component2 = await mapComponent(node, ctx.bag);
        if (component2 !== void 0) {
          irNode.component = component2;
          ctx.counts.components += 1;
        } else {
          irNode.kind = "frame";
          await applySurface(node, irNode, ctx);
          await appendChildren(node, irNode, ctx);
        }
        break;
      }
      case "image": {
        const assetId = await registerAsset(node, name, ctx);
        if (assetId !== null) {
          irNode.fill = { type: "IMAGE", assetId, scaleMode: readScaleMode(node, parsed.flatten) };
        } else {
          irNode.kind = "frame";
        }
        break;
      }
      case "frame":
      case "group": {
        await applySurface(node, irNode, ctx);
        await appendChildren(node, irNode, ctx);
        break;
      }
    }
    ctx.counts.nodes += 1;
    return irNode;
  }
  async function applySurface(node, irNode, ctx) {
    const layout = mapLayout(node, ctx.bag);
    if (layout !== void 0) irNode.layout = layout;
    const fill = await mapFill(node, ctx.bag, ctx.tokens);
    if (fill !== void 0) irNode.fill = fill;
    const stroke = await mapStroke(node, ctx.tokens);
    if (stroke !== void 0) irNode.stroke = stroke;
    const corners = mapCornerRadius(node);
    if (corners !== void 0) irNode.cornerRadius = corners;
  }
  async function appendChildren(node, irNode, ctx) {
    if (!("children" in node)) return;
    const parentHasLayout = hasAutoLayout(node);
    const children = [];
    for (const child of node.children) {
      const built = await visit(child, node, ctx, { parentHasLayout, isRoot: false });
      if (built !== null) children.push(built);
    }
    if (children.length > 0) irNode.children = children;
  }
  function classify(node, flatten) {
    if (node.type === "TEXT") return "text";
    if (node.type === "INSTANCE") return "instance";
    if (flatten || VECTOR_LIKE.has(node.type) || hasImagePaint(node)) return "image";
    if (node.type === "GROUP") return "group";
    if (node.type === "FRAME" || node.type === "COMPONENT" || node.type === "COMPONENT_SET" || node.type === "RECTANGLE") {
      return "frame";
    }
    return null;
  }
  function reportNodeIssues(node, kind, flatten, isRoot, ctx) {
    const { bag } = ctx;
    if (isDefaultLayerName(node.name)) {
      bag.warn(
        RULES.defaultLayerName,
        `"${node.name}" e nome automatico do Figma. Na Unity vira um GameObject com esse nome.`,
        node
      );
    }
    if ("rotation" in node && Math.abs(node.rotation) > 0.01) {
      bag.warn(
        RULES.rotatedNode,
        'Node rotacionado tem suporte limitado: a posicao vem da caixa alinhada aos eixos. Achate com "#img" se a rotacao importa.',
        node
      );
    }
    if (!flatten && kind !== "image") {
      if (hasVisibleEffect(node)) {
        bag.warn(
          RULES.unsupportedEffect,
          'Sombra, blur ou blend mode nao sao reconstruidos e serao perdidos. Marque a layer com "#img".',
          node
        );
      }
      if (hasGradientPaint(node)) {
        bag.warn(
          RULES.unsupportedEffect,
          'Gradiente nao e reconstruido. Marque a layer com "#img".',
          node
        );
      }
    }
    if (!flatten && VECTOR_LIKE.has(node.type)) {
      bag.warn(
        RULES.complexVector,
        `${node.type} foi rasterizado automaticamente. Marque com "#img" para deixar a intencao explicita.`,
        node
      );
    }
    if (!isRoot && node.type !== "INSTANCE" && kind !== "text") {
      const canonical = normalizeCanonicalName(node.name);
      if (canonical !== null && looksLikeKitName(canonical)) {
        bag.warn(
          RULES.detachedInstance,
          `"${node.name}" tem nome de componente do kit mas nao e uma instancia. Use a instancia da Library para herdar comportamento.`,
          node
        );
      }
    }
  }
  function applyBind(node, bind, irNode, ctx) {
    if (bind === null) return;
    if (!isValidBind(bind)) {
      ctx.bag.error(
        RULES.invalidBind,
        `"@${bind}" nao e um identificador valido. Use letras, digitos e underscore, comecando por letra.`,
        node
      );
      return;
    }
    const existing = ctx.binds.get(bind);
    if (existing !== void 0) {
      ctx.bag.error(
        RULES.duplicateBind,
        `"@${bind}" aparece mais de uma vez. Cada bind precisa ser unico na tela.`,
        node
      );
      return;
    }
    ctx.binds.set(bind, node.id);
    irNode.bind = bind;
  }
  async function registerAsset(node, name, ctx) {
    const { assetScale, exportAssets } = ctx.opts;
    if (node.width <= 0 || node.height <= 0) {
      ctx.bag.warn(
        RULES.complexVector,
        "Layer sem area nao pode ser rasterizada e foi exportada como container vazio.",
        node
      );
      return null;
    }
    const id = toAssetId(name, node.id);
    const file = `images/${id}@${assetScale}x.png`;
    if (exportAssets) {
      try {
        const bytes = await node.exportAsync({
          format: "PNG",
          constraint: { type: "SCALE", value: assetScale }
        });
        ctx.packed.push({ path: file, bytes });
      } catch (error) {
        ctx.bag.warn(
          RULES.complexVector,
          `Nao foi possivel rasterizar esta layer (${describeError(error)}).`,
          node
        );
        return null;
      }
    }
    const asset = {
      id,
      file,
      scale: assetScale,
      width: Math.max(1, Math.round(node.width * assetScale)),
      height: Math.max(1, Math.round(node.height * assetScale))
    };
    ctx.assets.push(asset);
    return id;
  }
  function readScaleMode(node, flatten) {
    if (flatten || !hasImagePaint(node)) return "STRETCH";
    if ("fills" in node && Array.isArray(node.fills)) {
      const paint = [...node.fills].reverse().find((item) => item.visible !== false);
      if (paint?.type === "IMAGE") {
        switch (paint.scaleMode) {
          case "FILL":
          case "CROP":
            return "FILL";
          case "FIT":
            return "FIT";
          case "TILE":
            return "TILE";
          default:
            return "FIT";
        }
      }
    }
    return "FIT";
  }
  function readSource() {
    let fileKey = "local";
    try {
      const key = figma.fileKey;
      if (typeof key === "string" && key.length > 0) fileKey = key;
    } catch {
      fileKey = "local";
    }
    return {
      fileKey,
      fileName: figma.root.name,
      pageName: figma.currentPage.name,
      exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
      pluginVersion: PLUGIN_VERSION
    };
  }
  function describeError(error) {
    if (error instanceof Error) return error.message;
    return String(error);
  }

  // src/code.ts
  var ASSET_SCALE = 2;
  figma.showUI(__html__, { width: 400, height: 620, themeColors: true });
  function post(message) {
    figma.ui.postMessage(message);
  }
  var scanGeneration = 0;
  async function scan() {
    const generation = ++scanGeneration;
    try {
      const result = await build(figma.currentPage.selection, {
        exportAssets: false,
        assetScale: ASSET_SCALE
      });
      if (generation !== scanGeneration) return;
      const scanned = {
        screenName: result.screenName,
        canvasWidth: result.ir?.canvas.width ?? 0,
        canvasHeight: result.ir?.canvas.height ?? 0,
        nodeCount: result.nodeCount,
        assetCount: result.ir?.assets.length ?? 0,
        bindCount: result.bindCount,
        componentCount: result.componentCount,
        diagnostics: result.bag.sorted()
      };
      post({ type: "scanned", result: scanned });
    } catch (error) {
      if (generation !== scanGeneration) return;
      post({ type: "failed", message: describeError2(error) });
    }
  }
  async function exportScreen() {
    post({ type: "busy", label: "Montando o pacote..." });
    try {
      const result = await build(figma.currentPage.selection, {
        exportAssets: true,
        assetScale: ASSET_SCALE
      });
      if (result.ir === null || result.screenName === null || result.bag.hasErrors) {
        post({
          type: "scanned",
          result: {
            screenName: result.screenName,
            canvasWidth: result.ir?.canvas.width ?? 0,
            canvasHeight: result.ir?.canvas.height ?? 0,
            nodeCount: result.nodeCount,
            assetCount: result.ir?.assets.length ?? 0,
            bindCount: result.bindCount,
            componentCount: result.componentCount,
            diagnostics: result.bag.sorted()
          }
        });
        return;
      }
      post({
        type: "export-ready",
        payload: {
          fileName: `${result.screenName}.uiexport`,
          json: JSON.stringify(result.ir, null, 2),
          assets: result.assets
        }
      });
    } catch (error) {
      post({ type: "failed", message: describeError2(error) });
    }
  }
  async function buildKit() {
    post({ type: "busy", label: "Criando componentes..." });
    try {
      const result = await createKit();
      post({ type: "kit-created", summary: result });
    } catch (error) {
      post({ type: "failed", message: describeError2(error) });
      return;
    }
    void scan();
  }
  figma.ui.onmessage = (message) => {
    switch (message.type) {
      case "rescan":
        void scan();
        break;
      case "export":
        void exportScreen();
        break;
      case "create-kit":
        void buildKit();
        break;
      case "select-node":
        void revealNode(message.nodeId);
        break;
      case "close":
        figma.closePlugin();
        break;
    }
  };
  async function revealNode(nodeId) {
    try {
      const node = await figma.getNodeByIdAsync(nodeId);
      if (node === null || node.type === "DOCUMENT" || node.type === "PAGE") return;
      figma.viewport.scrollAndZoomIntoView([node]);
    } catch {
    }
  }
  figma.on("selectionchange", () => {
    void scan();
  });
  void scan();
  function describeError2(error) {
    return error instanceof Error ? error.message : String(error);
  }
})();
