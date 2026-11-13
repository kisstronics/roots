interface LivingSwitchProps {
  living: boolean;
  onChange: (living: boolean) => void;
}

export function LivingSwitch({ living, onChange }: LivingSwitchProps) {
  return (
    <label className="living-switch">
      <span>Living</span>
      <input
        type="checkbox"
        role="switch"
        checked={living}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}
