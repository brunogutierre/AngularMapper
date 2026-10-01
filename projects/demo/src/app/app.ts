import { DatePipe, JsonPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { TrafficLog } from './backend/traffic-log';
import { UserApi } from './users/user-api';
import type { User, UserStatus } from './users/user.models';

@Component({
  selector: 'app-root',
  imports: [DatePipe, JsonPipe],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly api = inject(UserApi);
  protected readonly traffic = inject(TrafficLog);
  protected readonly statuses: readonly UserStatus[] = ['active', 'inactive', 'pending'];

  protected readonly selected = signal<User | null>(null);
  protected readonly draft = signal<Pick<User, 'name' | 'status'>>({ name: '', status: 'active' });
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected select(id: number): void {
    this.error.set(null);
    this.api.get(id).subscribe({
      next: (user) => {
        this.selected.set(user);
        this.draft.set({ name: user.name, status: user.status });
      },
      error: (error: unknown) => {
        this.fail(error);
      },
    });
  }

  protected edit(changes: Partial<Pick<User, 'name' | 'status'>>): void {
    this.draft.update((draft) => ({ ...draft, ...changes }));
  }

  protected save(user: User): void {
    const { name, status } = this.draft();
    // Only changed fields are sent: the mapper keeps partial payloads partial.
    const changes: Partial<User> = {
      ...(name !== user.name && { name }),
      ...(status !== user.status && { status }),
    };
    this.saving.set(true);
    this.api.update(user.id, changes).subscribe({
      next: (updated) => {
        this.selected.set(updated);
        this.saving.set(false);
        this.api.users.reload();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.fail(error);
      },
    });
  }

  private fail(error: unknown): void {
    this.error.set(error instanceof Error ? error.message : 'Request failed.');
  }
}
