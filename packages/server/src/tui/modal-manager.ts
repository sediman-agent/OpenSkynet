/**
 * Modal Manager
 * Manages modal state and interactions
 */

import type { ModalType, ModalState, SelectItem } from './types.js';

/**
 * Modal Manager
 * This is extracted from tui/app.ts
 */
export class ModalManager {
  private state: ModalState = {
    active: null,
    selectedIndex: 0,
    scrollOffset: 0,
    filter: '',
    filterMode: false,
    items: [],
    inputValue: '',
    infoTitle: '',
    infoLines: [],
    pendingAction: null,
    doctorResults: [],
    doctorInstallState: null,
    doctorInstallCmd: '',
    doctorInstallOutput: '',
    themePreviewIndex: -1,
  };

  /**
   * Get modal state
   */
  getState(): ModalState {
    return this.state;
  }

  /**
   * Check if modal is active
   */
  isActive(): boolean {
    return this.state.active !== null;
  }

  /**
   * Get active modal type
   */
  getActiveModal(): ModalType | null {
    return this.state.active;
  }

  /**
   * Open modal
   */
  openModal(type: ModalType): void {
    this.state.active = type;
    this.state.selectedIndex = 0;
    this.state.scrollOffset = 0;
    this.state.filter = '';
    this.state.filterMode = false;
  }

  /**
   * Close modal
   */
  closeModal(theme?: string): void {
    if (this.state.active === 'themePicker' && this.state.themePreviewIndex >= 0 && theme) {
      // Apply previewed theme if closing theme picker
    }
    this.state.active = null;
    this.state.filterMode = false;
    this.state.inputValue = '';
    this.state.themePreviewIndex = -1;
  }

  /**
   * Set modal items
   */
  setItems(items: SelectItem[]): void {
    this.state.items = items;
    this.state.selectedIndex = 0;
    this.state.scrollOffset = 0;
  }

  /**
   * Get modal items
   */
  getItems(): SelectItem[] {
    return this.state.items;
  }

  /**
   * Move selection up
   */
  selectUp(): void {
    if (this.state.selectedIndex > 0) {
      this.state.selectedIndex--;
      this.adjustScrollOffset();
    }
  }

  /**
   * Move selection down
   */
  selectDown(): void {
    if (this.state.selectedIndex < this.state.items.length - 1) {
      this.state.selectedIndex++;
      this.adjustScrollOffset();
    }
  }

  /**
   * Get selected item
   */
  getSelectedItem(): SelectItem | undefined {
    return this.state.items[this.state.selectedIndex];
  }

  /**
   * Get selected index
   */
  getSelectedIndex(): number {
    return this.state.selectedIndex;
  }

  /**
   * Set selected index
   */
  setSelectedIndex(index: number): void {
    this.state.selectedIndex = Math.max(0, Math.min(index, this.state.items.length - 1));
    this.adjustScrollOffset();
  }

  /**
   * Get scroll offset
   */
  getScrollOffset(): number {
    return this.state.scrollOffset;
  }

  /**
   * Adjust scroll offset based on selection
   */
  private adjustScrollOffset(): void {
    const itemHeight = 3; // Approximate height per item in terminal rows
    const visibleItems = 10;

    if (this.state.selectedIndex < this.state.scrollOffset) {
      this.state.scrollOffset = this.state.selectedIndex;
    } else if (this.state.selectedIndex >= this.state.scrollOffset + visibleItems) {
      this.state.scrollOffset = this.state.selectedIndex - visibleItems + 1;
    }
  }

  /**
   * Get filter text
   */
  getFilter(): string {
    return this.state.filter;
  }

  /**
   * Set filter text
   */
  setFilter(filter: string): void {
    this.state.filter = filter;
  }

  /**
   * Get filtered items
   */
  getFilteredItems(): SelectItem[] {
    if (!this.state.filter) {
      return this.state.items;
    }

    const lowerFilter = this.state.filter.toLowerCase();
    return this.state.items.filter(item =>
      item.label.toLowerCase().includes(lowerFilter) ||
      item.detail?.toLowerCase().includes(lowerFilter)
    );
  }

  /**
   * Toggle filter mode
   */
  toggleFilterMode(): void {
    this.state.filterMode = !this.state.filterMode;
    if (!this.state.filterMode) {
      this.state.filter = '';
    }
  }

  /**
   * Check if filter mode is active
   */
  isFilterMode(): boolean {
    return this.state.filterMode;
  }

  /**
   * Get input value
   */
  getInputValue(): string {
    return this.state.inputValue;
  }

  /**
   * Set input value
   */
  setInputValue(value: string): void {
    this.state.inputValue = value;
  }

  /**
   * Set info display
   */
  setInfo(title: string, lines: string[]): void {
    this.state.infoTitle = title;
    this.state.infoLines = lines;
  }

  /**
   * Get info display
   */
  getInfo(): { title: string; lines: string[] } {
    return {
      title: this.state.infoTitle,
      lines: this.state.infoLines
    };
  }

  /**
   * Set pending action
   */
  setPendingAction(action: string | null): void {
    this.state.pendingAction = action;
  }

  /**
   * Get pending action
   */
  getPendingAction(): string | null {
    return this.state.pendingAction;
  }
}
