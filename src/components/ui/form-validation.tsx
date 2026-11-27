"use client";

import { useEffect } from "react";

/**
 * Validates AFTER interaction and keeps ARIA in sync with the native :user-invalid state.
 * Delegated listeners (no inline scripts): blur/change show the browser's own message under the field, input clears it,
 * a failed submit flags every invalid field and the browser focuses the first. One polite live region announces blur errors.
 * Fields opt out with data-no-validate-ui.
 */
export function FormValidation() {
  useEffect(() => {
    const live = document.createElement("div");
    live.className = "visually-hidden";
    live.setAttribute("aria-live", "polite");
    document.body.append(live);
    let timer: ReturnType<typeof setTimeout>;
    const isField = (el: EventTarget | null): el is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement =>
      el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement;
    const errId = (el: HTMLElement) => `${el.id || el.getAttribute("name")}-err`;
    const sync = (el: EventTarget | null, announce = false) => {
      if (!isField(el) || el.type === "hidden" || el.type === "submit" || el.hasAttribute("data-no-validate-ui") || !el.id) return;
      const invalid = el.matches(":user-invalid");
      const id = errId(el);
      let box = document.getElementById(id);
      const ids = (el.getAttribute("aria-describedby") ?? "").split(/\s+/).filter((x) => x && x !== id);
      if (invalid) {
        if (!box) {
          box = document.createElement("p");
          box.id = id;
          box.className = "field-error";
          const icon = document.createElement("span");
          icon.setAttribute("role", "img");
          icon.setAttribute("aria-label", "Error");
          icon.textContent = "⚠";
          const msg = document.createElement("span");
          box.append(icon, msg);
          (el.closest("div") ?? el.parentElement)?.append(box);
        }
        const text = el.validationMessage;
        if (box.lastElementChild && box.lastElementChild.textContent !== text) {
          box.lastElementChild.textContent = text;
          if (announce) {
            clearTimeout(timer);
            live.textContent = "";
            const label = el.labels?.[0]?.textContent?.trim() ?? "";
            timer = setTimeout(() => { live.textContent = `${label}: ${text}`; }, 500);
          }
        }
        el.setAttribute("aria-invalid", "true");
        el.setAttribute("aria-describedby", [...ids, id].join(" "));
      } else {
        box?.remove();
        el.setAttribute("aria-invalid", "false");
        if (ids.length) el.setAttribute("aria-describedby", ids.join(" ")); else el.removeAttribute("aria-describedby");
      }
    };
    const onBlur = (e: Event) => sync(e.target, true);
    const onInput = (e: Event) => { if (isField(e.target) && e.target.getAttribute("aria-invalid") === "true") sync(e.target); };
    const onChange = (e: Event) => sync(e.target, true);
    const onInvalid = (e: Event) => sync(e.target);
    document.addEventListener("blur", onBlur, true);
    document.addEventListener("input", onInput);
    document.addEventListener("change", onChange, true);
    document.addEventListener("invalid", onInvalid, true);
    return () => {
      document.removeEventListener("blur", onBlur, true);
      document.removeEventListener("input", onInput);
      document.removeEventListener("change", onChange, true);
      document.removeEventListener("invalid", onInvalid, true);
      clearTimeout(timer);
      live.remove();
    };
  }, []);
  return null;
}
