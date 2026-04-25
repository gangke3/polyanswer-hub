export interface PromptInputProps {
  value: string;
  onChange: (value: string) => void;
}

export function PromptInput(props: PromptInputProps) {
  return (
    <textarea
      className="question-input"
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
      rows={5}
    />
  );
}
