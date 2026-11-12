import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators
} from '@angular/forms';
import { finalize } from 'rxjs';
import { Link, LinksService } from './links.service';

function httpUrlValidator(control: AbstractControl<string>): ValidationErrors | null {
  const value = control.value.trim();
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? null
      : { httpUrl: true };
  } catch {
    return { httpUrl: true };
  }
}

@Component({
  selector: 'app-root',
  imports: [ReactiveFormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly linksService = inject(LinksService);

  readonly links = signal<Link[]>([]);
  readonly loading = signal(true);
  readonly submitting = signal(false);
  readonly listError = signal('');
  readonly urlError = signal('');
  readonly success = signal<Link | null>(null);
  readonly copyStatus = signal('');

  readonly form = this.formBuilder.nonNullable.group({
    url: ['', [Validators.required, httpUrlValidator]]
  });

  ngOnInit(): void {
    this.loadLinks();
  }

  get urlControl() {
    return this.form.controls.url;
  }

  refresh(): void {
    this.loadLinks();
  }

  async copyLink(url: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      this.copyStatus.set('Link copied');
    } catch {
      this.copyStatus.set('Could not copy link. Select and copy it instead.');
    }
  }

  submit(): void {
    this.success.set(null);
    this.urlError.set('');
    this.copyStatus.set('');
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.linksService.create(this.urlControl.value.trim())
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: (link) => {
          this.success.set(link);
          this.form.reset();
          this.loadLinks();
        },
        error: (error: unknown) => this.urlError.set(this.errorMessage(error))
      });
  }

  private loadLinks(): void {
    this.loading.set(true);
    this.listError.set('');
    this.linksService.list()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (links) => this.links.set(links),
        error: (error: unknown) => this.listError.set(this.errorMessage(error))
      });
  }

  private errorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse && typeof error.error?.error === 'string') {
      return error.error.error;
    }
    return 'Could not reach the Snip API. Check that the backend is running and try again.';
  }
}
