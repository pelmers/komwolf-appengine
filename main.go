package server

import (
	"encoding/json"
	"fmt"
	"github.com/pelmers/komwolf"
	"github.com/strava/go.strava"
	"google.golang.org/appengine"
	"google.golang.org/appengine/log"
	"google.golang.org/appengine/urlfetch"
	"io/ioutil"
	"net/http"
	"os"
	"strconv"
	"strings"
)

var defaultToken string

// Find the strava token either from file.
func findToken() string {
	var contents []byte
	var err error
	tokenFilename := "STRAVA_TOKEN"
	_, err = os.Stat(tokenFilename)
	if err == nil {
		contents, err = ioutil.ReadFile(tokenFilename)
		if err == nil {
			return strings.TrimSpace(string(contents))
		}
	}
	return ""
}

// If in is "default" then return defaultToken, otherwise echo.
func replaceDefault(in string) string {
	if in == "default" {
		return defaultToken
	}
	return in
}

func init() {
	defaultToken = findToken()
	http.Handle("/", http.FileServer(http.Dir("./static")))
	http.HandleFunc("/explore", explore)
	http.HandleFunc("/detail", detail)
}

/// Explore provided bounds and return all segments found.
func explore(w http.ResponseWriter, r *http.Request) {
	ctx := appengine.NewContext(r)
	httpClient := urlfetch.Client(ctx)
	if err := r.ParseForm(); err != nil {
		log.Errorf(ctx, err.Error())
		return
	}
	key := replaceDefault(r.Form.Get("key"))
	actType := r.Form.Get("type")
	// Error handling in 2017
	north, err := strconv.ParseFloat(r.Form.Get("north"), 64)
	if err != nil {
		log.Errorf(ctx, err.Error())
		return
	}
	south, err := strconv.ParseFloat(r.Form.Get("south"), 64)
	if err != nil {
		log.Errorf(ctx, err.Error())
		return
	}
	east, err := strconv.ParseFloat(r.Form.Get("east"), 64)
	if err != nil {
		log.Errorf(ctx, err.Error())
		return
	}
	west, err := strconv.ParseFloat(r.Form.Get("west"), 64)
	if err != nil {
		log.Errorf(ctx, err.Error())
		return
	}
	depth, err := strconv.ParseInt(r.Form.Get("depth"), 10, 32)
	if err != nil {
		log.Errorf(ctx, err.Error())
		return
	}
	client := strava.NewClient(key, httpClient)
	segments, err := komwolf.ExploreArea(client, south, west, north, east, actType, int(depth))
	if err != nil {
		log.Errorf(ctx, err.Error())
		fmt.Fprint(w, err.Error())
	} else {
		json.NewEncoder(w).Encode(segments)
	}
}

/// Return detailed information about the leader time of each segment if possible.
func detail(w http.ResponseWriter, r *http.Request) {
	var err error
	ctx := appengine.NewContext(r)
	httpClient := urlfetch.Client(ctx)
	if err = r.ParseForm(); err != nil {
		log.Errorf(ctx, err.Error())
		return
	}
	key := replaceDefault(r.Form.Get("key"))
	// Segments arrives as comma-separated integers.
	segmentIDStrings := strings.Split(r.Form.Get("segments"), ",")
	segmentIDs := make([]int64, len(segmentIDStrings))
	for i, val := range segmentIDStrings {
		segmentIDs[i], _ = strconv.ParseInt(val, 10, 64)
	}
	client := strava.NewClient(key, httpClient)
	detailMap := make(map[string]*strava.SegmentLeaderboardEntry)
	for _, id := range segmentIDs {
		leader, err := komwolf.SegmentLeader(client, id)
		if err != nil {
			break
		}
		detailMap[strconv.Itoa(int(id))] = leader
	}
	if err != nil {
		fmt.Fprint(w, err.Error())
		log.Errorf(ctx, err.Error())
	} else {
		json.NewEncoder(w).Encode(detailMap)
	}
}
