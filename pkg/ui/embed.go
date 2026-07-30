package ui

import (
	"embed"
	"io/fs"
	"net/http"
	"os"
	"path"
	"strings"
)

//go:embed all:dist
var distFS embed.FS

// Handler returns an http.Handler that serves static files from the embedded dist directory,
// with fallback to index.html for Single Page Application (SPA) routing.
func Handler() http.Handler {
	sub, err := fs.Sub(distFS, "dist")
	if err != nil {
		panic(err)
	}

	fileServer := http.FileServer(http.FS(sub))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Clean the requested path
		cleanPath := path.Clean(r.URL.Path)

		// Trim leading slash for fs lookup
		lookupPath := strings.TrimPrefix(cleanPath, "/")
		if lookupPath == "" {
			lookupPath = "."
		}

		// Try to open file in embedded FS
		f, err := sub.Open(lookupPath)
		if err == nil {
			stat, err := f.Stat()
			_ = f.Close()
			if err == nil && !stat.IsDir() {
				fileServer.ServeHTTP(w, r)
				return
			}
		}

		// If file doesn't exist or is a directory (and not index request), check index.html
		indexFile, err := sub.Open("index.html")
		if err == nil {
			_ = indexFile.Close()
			r.URL.Path = "/"
			fileServer.ServeHTTP(w, r)
			return
		}

		// Fallback if index.html is missing (e.g. before initial frontend build)
		if os.IsNotExist(err) || err != nil {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`<!DOCTYPE html><html><body><h2>LocalKanban Server</h2><p>Frontend assets not embedded yet. Please build frontend into pkg/ui/dist.</p></body></html>`))
			return
		}

		fileServer.ServeHTTP(w, r)
	})
}
