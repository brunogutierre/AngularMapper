import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideBrowserGlobalErrorListeners, type ApplicationConfig } from '@angular/core';
import { provideMapper, withNamingConvention } from '@brunogutierre/angular-mapper';
import { mapperInterceptor } from '@brunogutierre/angular-mapper/http';
import { fakeBackendInterceptor } from './backend/fake-backend.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideMapper(withNamingConvention('snake_case')),
    // mapperInterceptor runs first, so the fake backend receives and returns DTOs.
    provideHttpClient(withInterceptors([mapperInterceptor, fakeBackendInterceptor])),
  ],
};
