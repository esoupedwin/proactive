"use client";

import { useState } from "react";
import { ModelCombobox } from "./model-combobox";
import { Select } from "./ui";

/**
 * One tier's platform + model inputs on /admin/models. Client-side so the
 * model field's suggestions can follow the platform choice: openrouter opens
 * the catalogue combobox; openai stays a plain free-text field rather than
 * offering ids from the wrong catalogue.
 */
export function TierModelFields({
  tier,
  locked,
  initialPlatform,
  modelDefault,
  placeholder,
}: {
  tier: string;
  /** True when the tier is OpenAI-only (dropdown disabled). */
  locked: boolean;
  initialPlatform: "openai" | "openrouter";
  /** The stored override's model, or "" when the tier follows .env. */
  modelDefault: string;
  placeholder: string;
}) {
  const [platform, setPlatform] = useState(initialPlatform);

  return (
    <div className="mt-3 flex flex-wrap items-end gap-2">
      <label className="flex w-36 flex-col gap-1 text-xs text-ink-faint">
        Platform
        <Select
          name={`${tier}_platform`}
          value={platform}
          onChange={(e) =>
            setPlatform(e.target.value as "openai" | "openrouter")
          }
          disabled={locked}
        >
          <option value="openai">openai</option>
          {!locked && <option value="openrouter">openrouter</option>}
        </Select>
      </label>
      <label className="flex min-w-64 flex-1 flex-col gap-1 text-xs text-ink-faint">
        Model
        <ModelCombobox
          name={`${tier}_model`}
          defaultValue={modelDefault}
          placeholder={placeholder}
          platform={platform}
        />
      </label>
    </div>
  );
}
