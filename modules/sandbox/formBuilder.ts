import type { AbiFunctionDescription } from './types';

export interface ParameterField {
  name: string;
  type: string;
  placeholder: string;
}

export const buildParameterFields = (fn?: AbiFunctionDescription): ParameterField[] => {
  if (!fn) return [];
  return fn.inputs.map((input, index) => ({
    name: input.name || `arg_${index}`,
    type: input.type,
    placeholder: input.type
  }));
};
