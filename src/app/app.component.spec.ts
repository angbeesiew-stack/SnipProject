import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { AppComponent } from './app.component';
import { Link, LinksService } from './links.service';

describe('AppComponent', () => {
  let fixture: ComponentFixture<AppComponent>;
  let component: AppComponent;
  let linksService: jasmine.SpyObj<LinksService>;

  const link: Link = {
    code: 'aB12cd',
    url: 'https://example.com/a/long/path',
    shortUrl: 'http://localhost:3000/aB12cd',
    hits: 3,
    createdAt: '2026-01-01T00:00:00.000Z'
  };

  beforeEach(async () => {
    linksService = jasmine.createSpyObj<LinksService>('LinksService', ['list', 'create']);
    linksService.list.and.returnValue(of([]));
    linksService.create.and.returnValue(of(link));

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [{ provide: LinksService, useValue: linksService }]
    }).compileComponents();

    fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('rejects invalid URLs without sending a request', () => {
    component.form.controls.url.setValue('ftp://example.com/file');

    component.submit();

    expect(component.form.controls.url.invalid).toBeTrue();
    expect(component.form.controls.url.touched).toBeTrue();
    expect(linksService.create).not.toHaveBeenCalled();
  });

  it('creates a link and refreshes the list', () => {
    linksService.list.and.returnValue(of([link]));
    component.form.controls.url.setValue(link.url);

    component.submit();
    fixture.detectChanges();

    expect(linksService.create).toHaveBeenCalledWith(link.url);
    expect(component.success()).toEqual(link);
    expect(component.links()).toEqual([link]);
    expect(fixture.nativeElement.textContent).toContain(link.code);
    expect(fixture.nativeElement.textContent).toContain('3');
  });

  it('shows API validation errors beside the URL field', () => {
    linksService.create.and.returnValue(throwError(() => new HttpErrorResponse({
      error: { error: 'URL is invalid' },
      status: 400
    })));
    component.form.controls.url.setValue('https://example.com');

    component.submit();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('#url-feedback')?.textContent).toContain('URL is invalid');
  });
});
