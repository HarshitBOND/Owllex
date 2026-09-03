"use client"

import { PanelHeader, Row, RowGroup, Select, Toggle } from "./SettingsPrimitives"
import type { AssistantSection } from "../data/assistantSections"

interface AssistantPanelProps {
  section: AssistantSection
  choices: Record<string, string>
  onChoice: (key: string, value: string) => void
  toggles: Record<string, boolean>
  onToggle: (key: string, value: boolean) => void
}

export function AssistantPanel({ section, choices, onChoice, toggles, onToggle }: AssistantPanelProps) {
  return (
    <>
      <PanelHeader title={section.title} description={section.description} />

      {section.groups.map((group, groupIndex) => (
        <RowGroup key={group.title ?? groupIndex} title={group.title}>
          {group.fields.map((field) => (
            <Row key={field.key} label={field.label} hint={field.hint}>
              {field.kind === "select" ? (
                <Select
                  value={choices[field.key] ?? field.options[0]}
                  onChange={(value) => onChoice(field.key, value)}
                  options={field.options.map((option) => ({ value: option, label: option }))}
                />
              ) : (
                <Toggle
                  label={field.label}
                  checked={Boolean(toggles[field.key])}
                  onChange={(next) => onToggle(field.key, next)}
                />
              )}
            </Row>
          ))}
        </RowGroup>
      ))}
    </>
  )
}
