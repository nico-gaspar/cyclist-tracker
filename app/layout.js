import './globals.css';

export const metadata = {
  title: 'Cycling Calendar',
  description: 'Upcoming race calendars for top riders.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <header className="site-header">
            <h1>Cycling Calendar</h1>
            <p>Upcoming races for selected riders.</p>
            <nav className="site-nav">
              <a href="/">Riders</a>
              <a href="/calendar">Calendar</a>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
