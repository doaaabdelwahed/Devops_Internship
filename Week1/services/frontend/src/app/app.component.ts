import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject } from '@angular/core';

interface ServiceResponse {
  status?: string;
  service?: string;
  framework?: string;
  runtime?: string;
  timestamp?: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule],
  template: `
    <main class="page-shell">
      <header class="hero">
        <div class="eyebrow">DOCKER · ANGULAR · NESTJS</div>
        <h1>Microservices Dashboard</h1>
        <p>Two independently deployed services, one simple status page.</p>
        <button type="button" (click)="refresh()">Refresh status</button>
      </header>

      <section class="cards" aria-label="Service status">
        <article class="card">
          <div class="card-heading">
            <div>
              <span class="service-kind">FRONTEND SERVICE</span>
              <h2>Angular UI</h2>
            </div>
            <span class="badge online" *ngIf="frontendRunning">Running</span>
            <span class="badge offline" *ngIf="!frontendRunning">Unavailable</span>
          </div>

          <p class="description">
            {{ frontendRunning
              ? 'Angular application is loaded and running.'
              : 'Angular application is not available.' }}
          </p>

          <div class="detail">
            <span>Application</span>
            <code>http://localhost:4200</code>
          </div>
          <div class="detail">
            <span>Framework</span>
            <strong>Angular</strong>
          </div>
          <div class="detail">
            <span>Mode</span>
            <strong>Local development</strong>
          </div>
        </article>

        <article class="card">
          <div class="card-heading">
            <div>
              <span class="service-kind">BACKEND SERVICE</span>
              <h2>NestJS API</h2>
            </div>
            <span class="badge online" *ngIf="backendHealth?.status === 'ok'">
              Healthy
            </span>
            <span class="badge offline" *ngIf="backendHealth?.status !== 'ok'">
              Unavailable
            </span>
          </div>

          <p class="description">
            JSON API reached through Angular's development proxy.
          </p>

          <div class="detail">
            <span>Health endpoint</span>
            <code>/api/health</code>
          </div>
          <div class="detail">
            <span>Info endpoint</span>
            <code>/api/info</code>
          </div>
          <div class="detail">
            <span>Framework</span>
            <strong>{{ backendInfo?.framework || 'NestJS' }}</strong>
          </div>

          <p class="error" *ngIf="backendError">{{ backendError }}</p>
        </article>
      </section>

      <section class="response-panel">
        <h2>Live API response</h2>

        <div class="response-grid">
          <div>
            <h3>Frontend status</h3>
            <pre>{{ frontendStatus | json }}</pre>
          </div>

          <div>
            <h3>Backend /health</h3>
            <pre>{{ backendHealth | json }}</pre>
          </div>

          <div>
            <h3>Backend /info</h3>
            <pre>{{ backendInfo | json }}</pre>
          </div>
        </div>
      </section>

      <footer>
        Backend health checks run when the page loads and when you select Refresh status.
      </footer>
    </main>
  `,
})
export class AppComponent implements OnInit {
  private readonly http = inject(HttpClient);

  frontendRunning = true;
  frontendStatus: ServiceResponse = {
    status: 'ok',
    service: 'frontend',
    framework: 'Angular',
  };

  backendHealth: ServiceResponse | null = null;
  backendInfo: ServiceResponse | null = null;
  backendError = '';

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    this.backendError = '';
    this.backendHealth = null;
    this.backendInfo = null;

    this.http.get<ServiceResponse>('/api/health').subscribe({
      next: (data) => {
        this.backendHealth = data;
      },
      error: () => {
        this.backendError = 'Backend health endpoint could not be reached.';
      },
    });

    this.http.get<ServiceResponse>('/api/info').subscribe({
      next: (data) => {
        this.backendInfo = data;
      },
      error: () => {
        this.backendError = this.backendError
          ? `${this.backendError} Backend info endpoint could not be reached.`
          : 'Backend info endpoint could not be reached.';
      },
    });
  }
}