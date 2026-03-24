interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

export function Toggle({ checked, onChange, disabled }: ToggleProps) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative w-9 h-5 rounded-full p-0.5 flex items-center transition-colors duration-200 outline-none border-none ${
        checked ? 'bg-primary' : 'bg-border'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <div
        className="w-4 h-4 rounded-full bg-white transition-transform duration-200"
        style={{ transform: checked ? 'translateX(16px)' : 'translateX(0px)' }}
      />
    </button>
  )
}
