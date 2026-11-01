import {
  ArrowDown,
  ArrowUp,
  Check,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  X,
  Zap,
} from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/providers/ToastProvider'
import {
  DEFAULT_QUICK_CHIPS,
  getStoredQuickChips,
  saveStoredQuickChips,
  type QuickExpenseChip,
} from '@/utils/quickChips'

interface QuickChipsModalProps {
  open: boolean
  onClose: () => void
  onChipsChanged?: (chips: QuickExpenseChip[]) => void
}

export function QuickChipsModal({ open, onClose, onChipsChanged }: QuickChipsModalProps) {
  const { showToast } = useToast()
  const [chips, setChips] = useState<QuickExpenseChip[]>(() => getStoredQuickChips())

  // Subform for Add / Edit
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [isAddingNew, setIsAddingNew] = useState(false)
  const [formLabel, setFormLabel] = useState('')
  const [formAmount, setFormAmount] = useState('')
  const [formMerchant, setFormMerchant] = useState('')
  const [formNote, setFormNote] = useState('')
  const [formPaymentMethod, setFormPaymentMethod] = useState('UPI')

  useEffect(() => {
    if (open) {
      setChips(getStoredQuickChips())
      setEditingIndex(null)
      setIsAddingNew(false)
    }
  }, [open])

  const startEdit = (index: number) => {
    const chip = chips[index]
    if (!chip) return
    setEditingIndex(index)
    setIsAddingNew(false)
    setFormLabel(chip.label)
    setFormAmount(chip.amount)
    setFormMerchant(chip.merchant ?? '')
    setFormNote(chip.note ?? '')
    setFormPaymentMethod(chip.payment_method ?? 'UPI')
  }

  const startAdd = () => {
    setEditingIndex(null)
    setIsAddingNew(true)
    setFormLabel('☕ Coffee ₹60')
    setFormAmount('60')
    setFormMerchant('Cafe')
    setFormNote('Coffee / Tea')
    setFormPaymentMethod('UPI')
  }

  const cancelForm = () => {
    setEditingIndex(null)
    setIsAddingNew(false)
  }

  const handleSaveItem = (e: React.FormEvent) => {
    e.preventDefault()
    const cleanAmount = formAmount.trim()
    if (!cleanAmount || isNaN(Number(cleanAmount)) || Number(cleanAmount) <= 0) {
      showToast({ title: 'Invalid Amount', description: 'Please enter a valid price in rupees.', variant: 'error' })
      return
    }

    const cleanLabel = formLabel.trim() || `⚡ Quick ₹${cleanAmount}`

    const newChip: QuickExpenseChip = {
      id: editingIndex !== null ? chips[editingIndex].id : Date.now().toString(),
      label: cleanLabel,
      amount: cleanAmount,
      merchant: formMerchant.trim() || undefined,
      note: formNote.trim() || undefined,
      payment_method: formPaymentMethod || 'UPI',
    }

    let updated: QuickExpenseChip[]
    if (editingIndex !== null) {
      updated = [...chips]
      updated[editingIndex] = newChip
      showToast({ title: 'Shortcut Updated', description: `Updated "${newChip.label}".` })
    } else {
      updated = [...chips, newChip]
      showToast({ title: 'Shortcut Added', description: `Added "${newChip.label}".` })
    }

    setChips(updated)
    saveStoredQuickChips(updated)
    onChipsChanged?.(updated)
    setEditingIndex(null)
    setIsAddingNew(false)
  }

  const handleDelete = (index: number) => {
    if (chips.length <= 1) {
      showToast({ title: 'Cannot Delete', description: 'You must have at least one quick log shortcut.', variant: 'error' })
      return
    }
    const updated = chips.filter((_, i) => i !== index)
    setChips(updated)
    saveStoredQuickChips(updated)
    onChipsChanged?.(updated)
    if (editingIndex === index) {
      setEditingIndex(null)
    }
    showToast({ title: 'Shortcut Removed', description: 'Quick expense shortcut removed.' })
  }

  const moveUp = (index: number) => {
    if (index <= 0) return
    const updated = [...chips]
    const temp = updated[index - 1]
    updated[index - 1] = updated[index]
    updated[index] = temp
    setChips(updated)
    saveStoredQuickChips(updated)
    onChipsChanged?.(updated)
  }

  const moveDown = (index: number) => {
    if (index >= chips.length - 1) return
    const updated = [...chips]
    const temp = updated[index + 1]
    updated[index + 1] = updated[index]
    updated[index] = temp
    setChips(updated)
    saveStoredQuickChips(updated)
    onChipsChanged?.(updated)
  }

  const handleResetDefaults = () => {
    setChips(DEFAULT_QUICK_CHIPS)
    saveStoredQuickChips(DEFAULT_QUICK_CHIPS)
    onChipsChanged?.(DEFAULT_QUICK_CHIPS)
    setEditingIndex(null)
    setIsAddingNew(false)
    showToast({ title: 'Reset to Defaults', description: 'Restored original 5 quick log shortcuts.' })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Customize 1-Tap Quick Log"
      description="Edit shortcuts, modify preset prices, or create your own daily expenses."
      size="md"
      footer={
        <div className="flex items-center justify-between w-full">
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={handleResetDefaults}
            className="text-muted hover:text-text flex items-center gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Reset Defaults</span>
          </Button>

          <Button variant="primary" type="button" onClick={onClose}>
            Done
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Active Chips List */}
        {!isAddingNew && editingIndex === null && (
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-muted uppercase tracking-wider">
                Current Shortcuts ({chips.length})
              </span>
              <Button variant="secondary" size="sm" onClick={startAdd} className="flex items-center gap-1">
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Add Shortcut</span>
              </Button>
            </div>

            <div className="divide-y divide-border/60 border border-border rounded-xl bg-surface overflow-hidden">
              {chips.map((chip, index) => (
                <div
                  key={chip.id}
                  className="p-3 flex items-center justify-between gap-3 hover:bg-surface-raised/40 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-surface-raised border border-border text-xs font-bold text-text">
                        {chip.label}
                      </span>
                      <span className="text-xs font-mono font-bold text-primary">
                        ₹{chip.amount}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted mt-1 truncate">
                      {chip.merchant || 'Any merchant'} {chip.note ? `· ${chip.note}` : ''} ({chip.payment_method || 'UPI'})
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => moveUp(index)}
                      disabled={index === 0}
                      className="p-1 rounded-md text-muted hover:text-text disabled:opacity-30 disabled:pointer-events-none"
                      title="Move up"
                    >
                      <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveDown(index)}
                      disabled={index === chips.length - 1}
                      className="p-1 rounded-md text-muted hover:text-text disabled:opacity-30 disabled:pointer-events-none"
                      title="Move down"
                    >
                      <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => startEdit(index)}
                      className="p-1 rounded-md text-muted hover:text-primary transition-colors"
                      title="Edit price & details"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(index)}
                      className="p-1 rounded-md text-muted hover:text-rose-400 transition-colors"
                      title="Delete shortcut"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Edit or Add Item Subform */}
        {(isAddingNew || editingIndex !== null) && (
          <form
            onSubmit={handleSaveItem}
            className="p-4 rounded-xl bg-surface-raised border border-primary/30 space-y-3.5"
          >
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <span className="text-xs font-bold text-text uppercase tracking-wider flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                <span>{editingIndex !== null ? 'Edit Shortcut' : 'New Quick Shortcut'}</span>
              </span>
              <button
                type="button"
                onClick={cancelForm}
                className="text-muted hover:text-text p-1"
                title="Cancel editing"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-text mb-1">
                  Price in Rupees (₹) *
                </label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  required
                  value={formAmount}
                  onChange={(e) => {
                    const newAmt = e.target.value
                    setFormAmount(newAmt)
                    // Auto update amount in label if standard format
                    if (formLabel.includes('₹')) {
                      setFormLabel(formLabel.replace(/₹\d+/, `₹${newAmt}`))
                    }
                  }}
                  placeholder="e.g. 50"
                  className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-sm font-bold text-text focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text mb-1">
                  Button Label & Emoji *
                </label>
                <input
                  type="text"
                  required
                  value={formLabel}
                  onChange={(e) => setFormLabel(e.target.value)}
                  placeholder="e.g. ☕ Chai ₹40"
                  className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-xs font-semibold text-text focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-text mb-1">Merchant / Vendor</label>
                <input
                  type="text"
                  value={formMerchant}
                  onChange={(e) => setFormMerchant(e.target.value)}
                  placeholder="e.g. Tea Stall, Canteen, Fuel Station"
                  className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-xs text-text focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text mb-1">Payment Method</label>
                <select
                  value={formPaymentMethod}
                  onChange={(e) => setFormPaymentMethod(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-xs text-text focus:outline-none"
                >
                  <option value="UPI">UPI</option>
                  <option value="Cash">Cash</option>
                  <option value="Debit Card">Debit Card</option>
                  <option value="Credit Card">Credit Card</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text mb-1">Default Note</label>
              <input
                type="text"
                value={formNote}
                onChange={(e) => setFormNote(e.target.value)}
                placeholder="e.g. Morning chai, Daily expense"
                className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-xs text-text focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <Button variant="ghost" size="sm" type="button" onClick={cancelForm}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" type="submit" className="flex items-center gap-1">
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{editingIndex !== null ? 'Save Changes' : 'Add Shortcut'}</span>
              </Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  )
}
