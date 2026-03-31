import { useEffect } from 'react';
import type { AbiFunctionDescription } from '../types';
import { buildParameterFields } from '../formBuilder';

interface ParameterFormProps {
  fn?: AbiFunctionDescription;
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
}

const inputClass =
  'mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2 text-sm text-slate-200 focus:border-purple-500 focus:outline-none';

const ParameterForm = ({ fn, values, onChange }: ParameterFormProps) => {
  useEffect(() => {
    if (!fn) return;
    fn.inputs.forEach((input, index) => {
      const key = input.name || `arg_${index}`;
      if (!(key in values)) {
        onChange(key, '');
      }
    });
  }, [fn, values, onChange]);

  if (!fn) {
    return <p className="text-sm text-slate-500">Load an ABI to configure parameters.</p>;
  }

  const fields = buildParameterFields(fn);

  return (
    <div className="space-y-3">
      {fields.map((field) => (
        <label key={field.name} className="text-sm text-slate-300">
          {field.name}
          <input
            className={inputClass}
            value={values[field.name] ?? ''}
            placeholder={field.placeholder}
            onChange={(event) => onChange(field.name, event.target.value)}
          />
        </label>
      ))}
      {!fields.length && <p className="text-sm text-slate-500">No parameters required.</p>}
    </div>
  );
};

export default ParameterForm;
