export interface RankedList {
    _id: string;
    cover: string;
    cr_curve: CRCurve;
    leaderboard_id_list: string[];
    player_count: number;
    priority: number;
    shown_name: string;
    third_party: boolean;
}

export interface CRCurve {
    type: string;
}

export interface BaseCRCurve extends CRCurve {
    baseline: number;
    cutoff: number;
    exponential: number;
}

export interface LinearCRCurve extends CRCurve {
    points: number[][];
}

export interface Score {
    cr: {
        [key: string]: number;
    }[];
    score: number;
    song_id: string;
    time_set: number;
    user: number;
}

export interface LeaderboardInfo {
    _id: string;
    artist: string;
    bombs: number;
    bpm: number;
    characteristic: string;
    cover: string;
    difficulty: string;
    difficulty_duration: number;
    difficulty_settings: string;
    duration: number;
    forced_star_rating: any;
    hash: string;
    key: string;
    length: number;
    mapper: string;
    name: string;
    njs: number;
    notes: number;
    obstacles: number;
    star_rating: {
        [key: string]: number;
    };
    sub_name: string;
}