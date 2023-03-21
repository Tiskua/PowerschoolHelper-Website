const express = require('express')
const puppeteer = require('puppeteer')
const app = express()

let page = puppeteer.Page
let browser = puppeteer.Browser
const PORT = process.env.PORT || 4000
let hrefs = []

app.use(express.static('public'));

app.use(express.urlencoded({
    extended: true
}))

app.set('view engine', 'ejs')


app.post('/submit',function(req,res){
    res.redirect('/login/' + req.body.username + "/" + req.body.password)
})

app.get('/login/:username/:password', async(req, res) => {

    const username = req.params.username;
    const password = req.params.password;

    try {
        browser = await puppeteer.launch({headless: false})
        page = await browser.newPage()
        await page.goto("https://powerschool.hermitage.k12.pa.us")
        
        await page.type('#fieldAccount', username);
        await page.type('#fieldPassword', password);

        const submitButton = '#btn-enter-sign-in';

        await page.waitForSelector(submitButton);
        await page.click(submitButton);

        res.redirect('/student-info/1')

    } catch (err) {
        console.log(`ERROR: ${e}`)
        return res.send(err)
    }
})

app.get('/student-info/:quarter', async(req, res) => {
    try {
        const name = await getStudentName()
        const classes = await getClasses(Number(req.params.quarter))
        res.render('main', {studentName: name, data: classes, quarter: req.params.quarter})
    } catch(e) {
        console.log(e)
        res.send(`SOMETHING WENT WRONG WITH PUPPETEER ${e}`)
    }
    
})

app.get('/student-info/class-info/:classname/:quarter/:teacher/:grade/', async(req, res)=> {
     const clDetails = {
        "name" : req.params.classname,
        "quarter" : req.params.quarter,
        "teacher" : req.params.teacher,
        "grade" : req.params.grade,
    }
    for (const href of hrefs) {
        if (req.params.classname == href.className && req.params.quarter == href.quarter) {
            await page.goto("https://powerschool.hermitage.k12.pa.us/guardian/" + href.href)
            const clAssignments = await getAssignments()
            res.render('class', {details: clDetails, assignments: clAssignments})
        }
    } 
})

async function getAssignments() {
    const xPath = "/html/body/div[2]/div[4]/div[2]/div[3]/div[3]/div/div/div/table/tbody"
    await page.waitForXPath(xPath)
    const trs = await page.$$('tr')
    let assignments = []
    for (const tr of trs) {
        let tds = await tr.$$eval('td', tds => tds.map(td => td.innerText));
        if (tds[10] == undefined) {continue}
        const test = await tr.$$('td')
        let flags = []
        for (let i = 4; i < 8; i++) {
            const count = await page.evaluate(el => el.children.length, test[i])
            if (count > 1) {
                let flag = await page.evaluate(el => el.innerText, test[i])
                flags.push(flag)
            }
        }
        
        assignments.push({
            "name" : tds[2],
            "date" : tds[0],
            "category" : tds[1],
            "score" : tds[10],
            "percent" : tds[11],
            "flags" : flags

        })        
    }
    return assignments
}

async function getClasses(quarter) {
    let classesData = [];
    let quarterData = [];
    
    const url = await page.evaluate(() => document.location.href);
    if (url != "https://powerschool.hermitage.k12.pa.us/guardian/home.html") {
        await page.goto("https://powerschool.hermitage.k12.pa.us/guardian/home.html");
    } 
    await page.waitForXPath('/html/body/div[2]/div[4]/div[2]/div[3]/div/table[1]/tbody');
    const trs = await page.$$("tr");
    hrefs = [];
    for (let quarter = 1; quarter < 7; quarter++) {
        for (const tr of trs) {
            const tds = await tr.$$eval('td', tds => tds);
            if (tds.length < 20) {continue;}
            let classText = await tr.$$eval('td', tds => tds.map(td => td.innerText));
    
            const className = classText[11].split("Email")[0].replace("/(\r\n|\n|\r)/gm", "").replace("/", "__").trim();
            const classTeacher = classText[11].split("Email")[1].split("-")[0].replace("/(\r\n|\n|\r)/gm", "").trim();
            const grades = classText[11 + quarter].split("\n")
    
            const tdl = await tr.$$('td');
            const elementHandle = await tdl[11 + quarter].$('a');
            let href = ""
            if (elementHandle != null) {href = await page.evaluate(anchor => anchor.getAttribute('href'), elementHandle);}
    
            quarterData.push({
                "className" : className,
                "classGrade" : grades[1],
                "classWeightedGrade" : grades[0],
                "classTeacher" : classTeacher,
            });
            hrefs.push({
                "className" : className,
                "quarter" : quarter,
                "href": href
            })
        }  
        classesData.push(quarterData)
        quarterData = [];       
    }
    
    return classesData[quarter-1];

}


async function getStudentName() {
    await page.waitForXPath('/html/body/div[2]/div[4]/div[2]/h1');
    const elHandle = await page.$x('/html/body/div[2]/div[4]/div[2]/h1');
    const nameElement = await page.evaluate(el => el.textContent, elHandle[0]);
    const nameParts = nameElement.toString().split(": ")[1].split(" ");
    const firstName = nameParts[1];
    const lastName = nameParts[0].replace(",", "");
    return firstName + " " + lastName 
}

app.listen(PORT, () => console.log(`Listening on port ${PORT}`))