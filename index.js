/**
 * Created by Robin on 2016/10/24.
 */
const Redis = require('redis');
const Path = require("path");
const FS = require("fs");
const PlayMusic = "rb_play_music";
const PlayList = "rb_play_list";

const spawn = require('child_process').spawn;

const connect = Redis.createClient('6379','127.0.0.1');
const MUSIC_IDS = "rb_music_ids";

let isDev =process.env.NODE_ENV == "dev";
let DIR = "";
if(isDev) {
    DIR = "/Users/Robin/Documents/Product/robinwu.com/submodule/file/public/";
} else {
    DIR = "/mnt/robinwu.com/submodule/file/public/";
}

let Domain = "";
if(isDev) {
    Domain = "http://file.robinwu1.com:3000/";
} else {
    Domain = "http://file.robinwu.com/";
}

let FFmpegPath = "";
if(isDev) {
    FFmpegPath = "/usr/local/bin/ffmpeg";
} else {
    FFmpegPath = "/usr/bin/ffmpeg";
}

const m3u8File = "index.m3u8";
const outputFile = "%03d.ts";

function clipMusicFail(err) {
    console.log("err:",err);
    setTimeout(loadPreList,1000);
}

function playMusicFail(err) {
    console.log("err:",err);
    setTimeout(play,1000);
}

function rand(callBack) {
    connect.llen(MUSIC_IDS,function (err, len) {
        console.log("get length:",len);
        if(err) {
            callBack(-1,err);
            return;
        }
        let rand = Math.floor(Math.random()*len);
        connect.lindex(MUSIC_IDS,rand,function (err, musicName) {
            console.log("get index:",musicName);
            if(err) {
                callBack(-1,err);
                return;
            }
            connect.hgetall(musicName,function (err, musicInfo) {
                console.log('get all:',musicInfo);
                if(err) {
                    callBack(-1,err);
                    return;
                }
                musicInfo.id = musicName.replace("rb_music:","");
                callBack(0,musicInfo);
            });
        });
    });

}

function loadPreList() {
    connect.lpop(PlayMusic,function (listName, item) {
        if(item) {
            connect.hgetall(item,function (err, musicInfo) {
                console.log("prelist get music:",musicInfo);
                if(err) {
                    clipMusicFail(err);
                    return;
                }
                musicInfo.id = item.replace("rb_music:","");
                clipMusic(musicInfo,false);
            });
        } else {
            rand(function (code, musicInfo) {
                console.log("rand get music:",musicInfo);
                if(code == 0) {
                    clipMusic(musicInfo,true);
                } else {
                    clipMusicFail("rand fail");
                }
            })
        }
    });
}

function clipMusic(musicInfo,isrand) {
    console.log('get music:',musicInfo.id);
    let inputFile = musicInfo.url.replace("http://file.robinwu.com/",DIR);
    let outDir = Path.join(DIR,"hls",musicInfo.id);

    let m3u8File = Path.join(outDir,"index.m3u8");
    if(FS.existsSync(m3u8File)) {
        readPlayList(musicInfo,isrand);
    } else {
        if(!FS.existsSync(outDir)){
            FS.mkdirSync(outDir);
        }
        let outputFile = Path.join(outDir,"%03d.ts");

        console.log("params:",inputFile,m3u8File,outputFile);
        let ffmpeg = spawn(FFmpegPath,["-i",inputFile,'-acodec','aac',"-f",'segment',
            '-segment_time',"7","-strict","-2",'-segment_list',m3u8File,outputFile]);

        ffmpeg.stdout.on('data', function (data) {
            console.log('standard output:\n' + data);
        });

        ffmpeg.stderr.on('data', function (data) {
            console.log('standard error output:\n' + data);
        });

        ffmpeg.on('exit', function (code, signal) {
            console.log("ffmpeg exit:",code);
            if(code == 0) {
                readPlayList(musicInfo,isrand);
            } else {
                setTimeout(loadPreList,1000);
            }
        });
    }
}

function readPlayList(musicInfo,isrand) {
    let dir = Path.join(DIR,"hls",musicInfo.id);
    let m3u8File = Path.join(dir,"index.m3u8");
    if(FS.existsSync(m3u8File)) {
        FS.readFile(m3u8File,"utf8",function (err,data) {
            if(!err) {
                let lines = data.split("\n");
                for(let i = 0;i<lines.length;) {
                    let line = lines[i];
                    if(line.indexOf("#EXTINF:") != -1) {
                        i++;
                        let fileName = lines[i];
                        let content = line + Path.join(musicInfo.id,fileName);
                        if(isrand) {
                            content += ";rand";
                        }
                        connect.rpush(PlayList,content);
                    }
                    i++;
                }
                setTimeout(loadPreList,1000 * 3 * 60);
            } else {
                console.log("read file error:",m3u8File,err);
            }
        })
    }
}

let index = 0;
function play() {
    let date = new Date();
    console.log('current time:',date);
    let playListM3u8 = Path.join(DIR,"hls","index.m3u8");

    let content = "#EXTM3U\n" +
        "#EXT-X-VERSION:3\n" +
        "#EXT-X-MEDIA-SEQUENCE:" + index + "\n" +
        "#EXT-X-TARGETDURATION:10\n"+
        "#QT-BITRATE:24\n";

    for(let i = 0;i<3;i++) {
        connect.lpop(PlayList,function (listName, item) {
            if(item) {
                item = item.replace(";rand","");
                let list = item.split(",");
                content = content + list[0] + ",\n";
                content = content + Domain + "hls/" + list[1] + "\n";
                index++;
            }
            if(i == 2) {
                if(item) {
                    console.log('write file:',playListM3u8,content);
                    FS.writeFile(playListM3u8, content, (err) => {
                        if (err) throw err;
                        console.log('It\'s saved!');
                        setTimeout(play,15 * 1000);
                    });
                } else {
                    setTimeout(play,1000);
                }

            }
        });
    }

}

loadPreList();
play();
