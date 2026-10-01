import { Injectable, signal } from '@angular/core';

/** One request/response pair as seen on the wire (DTOs, after mapping). */
export interface TrafficEntry {
  readonly method: string;
  readonly url: string;
  readonly requestBody: unknown;
  readonly responseBody: unknown;
}

/** Records what the fake backend receives and returns, to show the DTO side of mapping. */
@Injectable({ providedIn: 'root' })
export class TrafficLog {
  private readonly _entries = signal<readonly TrafficEntry[]>([]);
  readonly entries = this._entries.asReadonly();

  record(entry: TrafficEntry): void {
    this._entries.update((entries) => [entry, ...entries].slice(0, 5));
  }
}
