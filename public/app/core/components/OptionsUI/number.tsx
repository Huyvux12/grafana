import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';

import { type StandardEditorProps, type NumberFieldConfigSettings } from '@grafana/data';
import { hasVarMappingVariableReference, isInVarMappingRange } from '@grafana/data/internal';
import { Stack } from '@grafana/ui';
import { SuggestionsInput } from 'app/core/components/SuggestionsInput/SuggestionsInput';
import { getVariableSuggestions } from 'app/core/components/SuggestionsInput/getVariableSuggestions';

import { getOutOfRangeText, NumberInput } from './NumberInput';
import { getVarMappingChecks, VarMappingChecks } from './varMappingChecks';
import { useVarMappingVariableUpdates, type VarMappingVariableSource } from './varMappingVariables';

type Props = StandardEditorProps<number, NumberFieldConfigSettings>;

export const NumberValueEditor = ({ value, onChange, item, id }: Props) => {
  const { settings } = item;

  const onValueChange = useCallback(
    (value: number | undefined) => {
      onChange(settings?.integer && value !== undefined ? Math.floor(value) : value);
    },
    [onChange, settings?.integer]
  );

  return (
    <NumberInput
      id={id}
      value={value}
      min={settings?.min}
      max={settings?.max}
      step={settings?.step}
      placeholder={settings?.placeholder}
      onChange={onValueChange}
    />
  );
};

type VarMappingProps = Omit<StandardEditorProps<number | string, NumberFieldConfigSettings>, 'value' | 'onChange'> & {
  value?: number | string;
  onChange: (value?: number | string) => void;
  /** The dashboard variables, to check the expression against */
  variables?: VarMappingVariableSource;
};

/**
 * Number editor that also accepts variable expressions. It's a separate component because
 * `NumberValueEditor` is used directly by some panel editors that expect a numeric `onChange`.
 *
 * A `type="number"` input can't hold a `$`, so this is a text input that suggests dashboard
 * variables on `$`. On blur, Enter or picking a suggestion, text with a variable reference is
 * passed to `onChange` as a string, which callers store in `varMappings`. A `$` without a variable
 * isn't stored. Anything else is parsed as a number in the settings' range, or reverted when it
 * isn't one.
 */
export const VarMappingNumberValueEditor = ({ value, onChange, item, id, context, variables }: VarMappingProps) => {
  const { settings } = item;
  const formatted = value == null ? '' : String(value);
  // SuggestionsInput keeps its own text, so it's remounted to show a value it didn't produce
  const [revision, setRevision] = useState(0);
  const [rangeError, setRangeError] = useState<string>();
  // The last text passed to onChange, so the blur after Enter doesn't commit it again
  const committed = useRef(formatted);

  // Only an expression is checked against the variables, so a plain number doesn't follow them
  useVarMappingVariableUpdates(typeof value === 'string' ? variables : undefined);

  useEffect(() => {
    setRangeError(undefined);
    if (formatted !== committed.current) {
      committed.current = formatted;
      setRevision((r) => r + 1);
    }
  }, [formatted]);

  const commit = useCallback(
    (raw: string) => {
      setRangeError(undefined);
      if (raw === committed.current) {
        return;
      }

      if (hasVarMappingVariableReference(raw)) {
        committed.current = raw;
        onChange(raw);
        return;
      }
      // Not an expression yet, so it's kept as typed until a variable name follows
      if (raw.includes('$')) {
        return;
      }

      if (raw.trim() === '') {
        committed.current = raw;
        onChange(undefined);
        return;
      }

      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) {
        setRevision((r) => r + 1);
        return;
      }

      const num = settings?.integer ? Math.floor(parsed) : parsed;
      if (!isInVarMappingRange(num, settings)) {
        setRangeError(getOutOfRangeText(settings?.min, settings?.max));
        return;
      }

      committed.current = raw;
      onChange(num);
    },
    [onChange, settings]
  );

  const checks =
    typeof value === 'string'
      ? getVarMappingChecks({
          kind: 'number',
          settings,
          expression: value,
          interpolate: variables?.interpolate ?? context.replaceVariables,
          variables: variables?.getVariables() ?? [],
        })
      : [];

  return (
    <Stack direction="column" gap={0.5}>
      {/* Only captures Enter bubbling up from the input; the input itself stays the interactive element */}
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div
        onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
          // SuggestionsInput only handles Enter to pick a suggestion, and prevents the default then
          if (e.key === 'Enter' && !e.defaultPrevented && e.target instanceof HTMLInputElement) {
            commit(e.target.value);
          }
        }}
      >
        <SuggestionsInput
          key={revision}
          id={id}
          value={formatted}
          placeholder={settings?.placeholder}
          suggestions={getVariableSuggestions()}
          invalid={rangeError !== undefined}
          error={rangeError}
          onChange={commit}
        />
      </div>
      <VarMappingChecks checks={checks} />
    </Stack>
  );
};
