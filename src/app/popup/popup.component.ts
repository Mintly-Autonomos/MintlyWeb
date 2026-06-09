import { CommonModule } from '@angular/common';
import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';

export type PopupPosition = 'top-left' | 'top-right';
export type PopupStatus = 'success' | 'error' | 'warning' | 'information';

export interface PopupItem {
  id: string;
  title: string;
  message: string;
  status: PopupStatus;
  position: PopupPosition;
  duration: number;
}

@Component({
  selector: 'app-popup',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatButtonModule],
  templateUrl: './popup.component.html',
  styleUrls: ['./popup.component.css'],
})
export class PopupComponent implements OnChanges, OnDestroy {
  @Input() popups: PopupItem[] = [];
  @Output() closed = new EventEmitter<string>();

  private popupTimers = new Map<string, ReturnType<typeof setTimeout>>();

  ngOnChanges(changes: SimpleChanges): void {
    if ('popups' in changes) {
      this.syncTimers();
    }
  }

  ngOnDestroy(): void {
    this.clearAllTimers();
  }

  trackByPopup(_: number, popup: PopupItem): string {
    return popup.id;
  }

  onClosePopup(id: string): void {
    this.clearTimer(id);
    this.closed.emit(id);
  }

  private syncTimers(): void {
    const currentIds = new Set(this.popups.map((popup) => popup.id));

    for (const popup of this.popups) {
      if (!this.popupTimers.has(popup.id)) {
        this.popupTimers.set(
          popup.id,
          setTimeout(() => this.onClosePopup(popup.id), popup.duration * 1000),
        );
      }
    }

    for (const id of Array.from(this.popupTimers.keys())) {
      if (!currentIds.has(id)) {
        this.clearTimer(id);
      }
    }
  }

  private clearTimer(id: string): void {
    const timer = this.popupTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.popupTimers.delete(id);
    }
  }

  private clearAllTimers(): void {
    for (const timer of this.popupTimers.values()) {
      clearTimeout(timer);
    }
    this.popupTimers.clear();
  }
}
