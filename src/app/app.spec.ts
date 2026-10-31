import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';
import { AuthService } from './services/auth.service';
import { IdleSessionService } from './services/idle-session.service';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes)],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  describe('vigia da inatividade', () => {
    it('logado: começa a vigiar; ao sair: para', async () => {
      const authenticated = signal(true);
      const start = vi.fn();
      const stop = vi.fn();
      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [App],
        providers: [
          provideRouter(routes),
          { provide: AuthService, useValue: { isAuthenticated: authenticated } },
          { provide: IdleSessionService, useValue: { start, stop } },
        ],
      }).compileComponents();

      const fixture = TestBed.createComponent(App);
      fixture.detectChanges();
      expect(start).toHaveBeenCalledTimes(1);
      expect(stop).not.toHaveBeenCalled();

      authenticated.set(false);
      fixture.detectChanges();
      expect(stop).toHaveBeenCalledTimes(1);
    });
  });

  it('should render the router outlet', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('router-outlet')).not.toBeNull();
  });
});
