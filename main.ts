import axios from 'axios';
import fs from 'fs';
import { BaseCRCurve, CRCurve, LeaderboardInfo, LinearCRCurve, RankedList, Score } from './types';

const POOL_NAME = 'poodles';
const TARGET_CR = 800;
const WEIGHTS = [6, 3, 1];
const ACC_AGE_DECREASE = 40; // Magic number, the lower it is the lower the CR of old scores
const AGE_CUTOFF = 4; // The number of months beyond which it'll stop lowering CR for age

function applyCurve(accuracy: number, crCurve: CRCurve) {
    switch (crCurve.type) {
        case 'basic': {
            return applyBasicCurve(accuracy, crCurve as BaseCRCurve);
        }
        case 'linear': {
            return applyLinearCurve(accuracy, crCurve as LinearCRCurve);
        }
        default: {
            console.error('Unknown curve type');
            process.exit(1);
        }
    }
}

function applyBasicCurve(accuracy: number, crCurve: BaseCRCurve) {
    const defaults: BaseCRCurve = {
        baseline: 0.78,
        cutoff: 0.5,
        exponential: 2.5,
        type: 'basic',
    }

    const baseline = crCurve.baseline ? crCurve.baseline * 100 : defaults.baseline * 100;
    const cutoff = crCurve.cutoff ? crCurve.cutoff : defaults.cutoff;
    const exponential = crCurve.exponential ? crCurve.exponential : defaults.exponential;

    if (accuracy < baseline) {
        return accuracy / 100 * cutoff;
    } else {
        return accuracy / 100 * cutoff + (1 - cutoff) * ((accuracy - baseline)/(100 - baseline)) ** exponential;
    }
}

function applyLinearCurve(accuracy: number, crCurve: LinearCRCurve) {
    const defaults: LinearCRCurve = {
        points: [[0, 0], [0.8, 0.5], [1, 1]],
        type: 'linear',
    }

    crCurve = {
        ...defaults,
        ...crCurve
    }

    accuracy /= 100;

    let i = 0;
    for (; i < crCurve.points.length; i++) {
        if (accuracy < crCurve.points[i][0]) break;
    }

    if (i == 0) {
        i = 1;
    }

    const middleDis = (accuracy - crCurve.points[i - 1][0]) / (crCurve.points[i][0] - crCurve.points[i - 1][0]);

    return crCurve.points[i - 1][1] + middleDis * (crCurve.points[i][1] - crCurve.points[i - 1][1]);
}

// Returns acc as a %
function acc(score: Score, leaderboardInfo: LeaderboardInfo) {
    let maxScore;
    if (leaderboardInfo.notes > 13) {
        maxScore = leaderboardInfo.notes * 920 - 7245;
    } else {
        const maxScores = [115, 345, 575, 805, 1035, 1495, 1955, 2415, 2875, 3335, 3795, 4255, 4715];
        maxScore = maxScores[leaderboardInfo.notes - 1];
    }
    return score.score / maxScore * 100;
}

// Returns score age in months
function scoreAge(score: Score) {
    const ageMillis = Date.now() - score.time_set * 1000;
    const ageMonths = ageMillis / (1000 * 60 * 60 * 24 * 30);
    return ageMonths;
}

// Returns score age heuristic
function ageHeurisitic(score: Score) {
    return 1 / (1 + scoreAge(score));
}

// Returns magic weighted acc
// I'm sorry, this function is not the most readable
function weightedAvg(scores: Score[], leaderboardInfo: LeaderboardInfo, weights: number[]) {
    let weightedAvgAcc = 0;
    let correctionFactorThing = 0;
    let weightedAge = 0;
    for (let i = 0; i < weights.length; i++) {
        weightedAvgAcc += acc(scores[i], leaderboardInfo) * weights[i] * ageHeurisitic(scores[i]);
        correctionFactorThing += weights[i] * ageHeurisitic(scores[i]);
        weightedAge += weights[i] * scoreAge(scores[i]);
    }
    weightedAvgAcc /= correctionFactorThing; // Corrects acc to be out of 100
    // Updates current day expected weighted average by increasing acc for old plays
    weightedAge /= weights.reduce((a, b) => a + b, 0);
    weightedAvgAcc += (100 - weightedAvgAcc) * (Math.min(weightedAge, AGE_CUTOFF) / ACC_AGE_DECREASE);
    return weightedAvgAcc;
}

async function main() {
    // Get map leaderboard IDs for pool
    let leaderboardIDs: string[] = [];
    let pool: RankedList;
    let i = 0;
    while (1 < 2) {
        pool = (await axios.get(`https://hitbloq.com/api/ranked_list/${POOL_NAME}/${i}`)).data as RankedList;
        leaderboardIDs = leaderboardIDs.concat(pool.leaderboard_id_list);
        if (pool.leaderboard_id_list.length != 30) break;
        i++;
    }

    const resetCommandsOut = [];
    const newSRCommandsOut = [];
    const humanReadableOut = [];
    i = 1;
    for (const leaderboardID of leaderboardIDs) {
        // Get info and top scores for each map
        const leaderboardInfo = (await axios.get(`https://hitbloq.com/api/leaderboard/${leaderboardID}/info`)).data as LeaderboardInfo;
        const scores = (await axios.get(`https://hitbloq.com/api/leaderboard/${leaderboardID}/scores/0`)).data as Score[];
        console.log(`\n${i}/${leaderboardIDs.length} ${leaderboardInfo.name}`);

        // Calculate required SR for weighted avg of top scores to be the target CR
        if (!scores.length) {
            console.log(`No scores for ${leaderboardInfo.name}.`);
            continue;
        } 
        const weightedAvgAcc = weightedAvg(scores, leaderboardInfo, WEIGHTS.slice(0, scores.length));
        console.log(`weighted avg: ${weightedAvgAcc.toFixed(2)}`);

        const curvedApplied = applyCurve(weightedAvgAcc, pool!.cr_curve);
        const starRating = TARGET_CR / (50 * curvedApplied);
        console.log(`star rating: ${starRating.toFixed(2)}`);
        resetCommandsOut.push(`!set_manual ${leaderboardID} ${POOL_NAME} ${leaderboardInfo.star_rating[POOL_NAME].toFixed(2)}`);
        newSRCommandsOut.push(`!set_manual ${leaderboardID} ${POOL_NAME} ${starRating.toFixed(2)}`);
        humanReadableOut.push(`${leaderboardInfo.name} | ${leaderboardInfo.difficulty} | ${starRating.toFixed(2)} (${leaderboardInfo.star_rating[POOL_NAME].toFixed(2)})`);
        i++;
    }
    newSRCommandsOut.push(`!recalculate_cr ${POOL_NAME}`);
    resetCommandsOut.push(`!recalculate_cr ${POOL_NAME}`);

    // Write output
    fs.writeFileSync('resetCommands.txt', resetCommandsOut.join('\n'));
    fs.writeFileSync('starRatingsCommands.txt', newSRCommandsOut.join('\n'));
    fs.writeFileSync('starRatingsReadable.txt', humanReadableOut.join('\n'));
}

main();