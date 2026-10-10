// CloudFront Function (runtime: cloudfront-js-2.0), event type: Viewer request.
// Attach it to the DEFAULT behaviour only (the website), NOT to /api/*.
//
// A single-page app has pages like /rehab or /dashboard that are not files in S3. Opening
// one directly (or refreshing it) must return index.html so React Router can show the page.
//
// Why not CloudFront's "custom error responses" instead? They apply to the whole
// distribution and would also replace the API's own 403/404 answers (for example
// "Session not found") with index.html, which breaks the app's error messages.
function handler(event) {
  var request = event.request;
  var uri = request.uri;

  // API calls and real files (anything whose last part has an extension) pass through unchanged
  if (uri.indexOf('/api/') === 0 || /\.[A-Za-z0-9]+$/.test(uri)) {
    return request;
  }

  request.uri = '/index.html';
  return request;
}
