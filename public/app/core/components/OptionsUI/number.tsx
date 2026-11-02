import { type ChangeEvent, type FocusEvent, type KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';

import { type StandardEditorProps, type NumberFieldConfigSettings } from '@grafana/data';
import { hasVarMappingVariableReference, isInVarMappingRange } from '@grafana/data/internal';
import { FieldValidationMessage, Input } from '@grafana/ui';

import { getOutOfRangeText, NumberInput } from './NumberInput';

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
};

/**
 * Number editor that also accepts variable expressions. It's a separate component because
 * `NumberValueEditor` is used directly by some panel editors that expect a numeric `onChange`.
 *
 * A `type="number"` input can't hold a `$`, so this is a text input. On blur or Enter, text with a
 * variable reference is passed to `onChange` as a string, which callers store in `varMappings`. A
 * `$` without a variable isn't stored. Anything else is parsed as a number in the settings' range,
 * or reverted when it isn't one.
 */
export const VarMappingNumberValueEditor = ({ value, onChange, item, id }: VarMappingProps) => {
  const { settings } = item;
  const formatted = value == null ? '' : String(value);
  const [text, setText] = useState(formatted);
  const [rangeError, setRangeError] = useState<string>();
  // The last text passed to onChange, so the blur after Enter doesn't commit it again
  const committed = useRef(formatted);

  useEffect(() => {
    committed.current = formatted;
    setText(formatted);
    setRangeError(undefined);
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
        setText(committed.current);
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

  return (
    <div>
      <Input
        type="text"
        id={id}
        value={text}
        placeholder={settings?.placeholder}
        invalid={rangeError !== undefined}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setText(e.currentTarget.value)}
        onBlur={(e: FocusEvent<HTMLInputElement>) => commit(e.currentTarget.value)}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Enter') {
            commit(e.currentTarget.value);
          }
        }}
      />
      {rangeError && <FieldValidationMessage>{rangeError}</FieldValidationMessage>}
    </div>
  );
};
