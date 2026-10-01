import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { App } from './app';
import { appConfig } from './app.config';
import { TrafficLog } from './backend/traffic-log';

/** End-to-end through the real providers: Mapper, interceptors and the fake backend. */
describe('App', () => {
  let fixture: ComponentFixture<App>;
  let element: HTMLElement;

  const settle = async (): Promise<void> => {
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [App], providers: appConfig.providers });
    fixture = TestBed.createComponent(App);
    element = fixture.nativeElement as HTMLElement;
    await settle();
  });

  it('lists users mapped from snake_case DTOs', () => {
    const items = [...element.querySelectorAll('.users li')].map((item) => item.textContent);

    expect(items).toHaveLength(2);
    expect(items[0]).toContain('Maria Silva');
    expect(items[0]).toContain('active');
    expect(items[0]).toContain('São Paulo · born Apr 12, 1990');
  });

  it('loads a user through the operator, including convention-mapped fields', async () => {
    element.querySelector<HTMLButtonElement>('.users button')?.click();
    await settle();

    expect(element.textContent).toContain('10.0.0.7');
    expect(element.textContent).toContain('01310-100');
  });

  it('sends only the changed fields as a snake_case PATCH body', async () => {
    element.querySelector<HTMLButtonElement>('.users button')?.click();
    await settle();

    const input = element.querySelector<HTMLInputElement>('form input');
    if (!input) throw new Error('Editor not rendered.');
    input.value = 'Maria Souza';
    input.dispatchEvent(new Event('input'));
    element.querySelector<HTMLFormElement>('form')?.dispatchEvent(new Event('submit'));
    await settle();

    const patch = TestBed.inject(TrafficLog)
      .entries()
      .find((entry) => entry.method === 'PATCH');
    expect(patch?.requestBody).toEqual({ full_name: 'Maria Souza' });
    expect(element.querySelector('.users li')?.textContent).toContain('Maria Souza');
  });
});
