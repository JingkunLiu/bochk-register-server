const { chromium } = require('playwright');

// ==========================================
// 配置你需要填写的表单信息
// ==========================================
const userInfo = {
    // ---- page 1 选项 ----
    idType: "中國居民身份證",       // 证件种类，例如 "HKID" (香港身份证)
    accountType: "一般賬戶",     // 账户种类，例如 "N" (跨境理財通:北向通匯款專戶)
    
    // ---- page 2 选项 ----
    title: "1",           // 称呼 (单选框选项值: 1=先生, 2=小姐, 3=太太, 4=女士)
    surname: "张",      // 姓氏
    firstName: "三明", // 名字
    countryNo: "86",      // 区号
    telNo: "13800138000", // 手机号码
    email: "example@example.com", // 邮箱
    
    precondition: "B",    // 办理条件依据 (单选框选项值: "B", "D" 等)
    
    district: "_central_western_district", // 区域
    branchCode: "中區分行",  // 分行代码
    appDate: "02/06/2026",  // 预约日期 (格式需与日历控件一致，如:02/06/2026)
    appTime: "09:00"        // 预约时间
};

(async () => {
    console.log("🚀 启动浏览器...");
    // headless: false 表示开启有界面模式，方便你观察它的操作。准备好后可以改成 true 来后台静默运行
    const browser = await chromium.launch({ headless: false, slowMo: 100 });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        // ==========================================
        // 第一步：访问首页，选择证件类型与账户种类
        // ==========================================
        const startUrl = 'https://transaction.bochk.com/whk/form/openAccount/input.action?lang=zh_HK'; // 请替换为第一步的实际线上真实URL
        console.log(`🌐 正在访问页面: ${startUrl}`);
        await page.goto(startUrl, { waitUntil: 'load' });

        // 等待选择框出现并选择证件类型和账户类型
        const idTypeSelector = 'select[name="bean.idType"]';
        const accountTypeSelector = 'select[name="bean.serviceAccountType"]';
        
        await page.waitForSelector(idTypeSelector, { timeout: 10000 });
        
        console.log(`✅ 正在选择证件种类 [${userInfo.idType}] 及账户种类 [${userInfo.accountType}]...`);
        await page.selectOption(idTypeSelector, userInfo.idType);
        await page.selectOption(accountTypeSelector, userInfo.accountType);

        // 选择完毕后可能会触发界面的重新渲染或显示协议等操作
        await page.waitForTimeout(500);

        // 勾选用户协议复选框
        const acceptTermsSelector = '#mortgageLoans_form_acceptTerms_field';
        await page.waitForSelector(acceptTermsSelector, { timeout: 5000 });
        console.log("✅ 正在勾选协议并进入下一步...");
        await page.check(acceptTermsSelector);
        
        // 点击继续按钮，触发跳转
        await page.click('#eAAOForm_submit_button');

        // ==========================================
        // 第二步：填写表单与验证码
        // ==========================================
        console.log("⏳ 等待资料填写页面加载...");
        // 通过等待一个必须的输入框出现来确认第二页已加载
        await page.waitForSelector('input[name="bean.surname"]');

        console.log("✍️ 正在填写基本信息...");
        
        // title 是一个单选框 (radio)
        await page.check(`input[name="bean.title"][value="${userInfo.title}"]`);

        // 填写普通输入框
        await page.fill('input[name="bean.surname"]', userInfo.surname);
        await page.fill('input[name="bean.firstName"]', userInfo.firstName);
        
        // countryNo 实际上是通过选择内部的 bean.backUp 单选框来触发它原生绑定的 JS ({#wwctrl_openMCaccount_countryNo_radio input}.on('change'))
        // 这样不仅能赋值到 test01 (真实提交使用的隐藏输入框)，还能更新上面的显示文案，彻底通过前端校验
        await page.locator('.searchContainer').click();           // 打开下拉层
        await page.waitForTimeout(500);                           // 等待动画
        
        // 由于原生的 radio input 往往是被隐藏的 (display: none)，直接 check 会报不可见/无法交互错误。
        // 我们通过直接点击它对应的 label 来触发选中效果。加上 force: true 防止元素被上层装饰特效遮挡。
        await page.click(`label[for="openMCaccount_countryNo_radio${userInfo.countryNo}"]`, { force: true });
        
        await page.waitForTimeout(500);                           // 等待它内部的setTimeout收起层

        await page.fill('input[name="bean.telNo"]', userInfo.telNo);
        await page.fill('input[name="bean.email"]', userInfo.email);

        // precondition 也是一个单选框 (radio)
        // 使用 try-catch 忽略可能的未找到（具体看页面是否需要这个字段，不一定所有流程都有）
        try { await page.check(`input[name="bean.precondition"][value="${userInfo.precondition}"]`); } catch(e){}

        // appDate 是只读 (readonly) 的日历输入框。通过底层 evaluate 强制赋值
        // 加入对 jQuery UI Datepicker 原生 API 的支持，确保彻底触发生态内的校验与级联更新
        await page.evaluate((dateVal) => {
            console.log("⏳ 正在设置预约日期...");
            const dateEl = document.getElementById('eAAOForm_appDate_field');
            if(dateEl) {
                // 如果页面上有 jQuery UI Datepicker，优先调用其原生 API 赋值，最为安全
                if (window.$ && window.$(dateEl).data('datepicker')) {
                    console.log("使用 jQuery UI Datepicker API 设置日期...");
                    window.$(dateEl).datepicker('setDate', dateVal);
                } else {
                    console.log("直接设置日期输入框的值...");
                    dateEl.value = dateVal;
                }
                
                // 触发在其行内绑定的 onchange 方法
                if (typeof window.changeAppDate === 'function') {
                    window.changeAppDate(dateVal);
                }

                // 派发通用的 change 事件兜底
                dateEl.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }, userInfo.appDate);
        

        /*
        // 处理分行区域 (动态寻找第一个未满且没被禁用的区域并选择)
        console.log("⏳ 正在寻找未满的分行区域...");
        const availableDistrict = await page.evaluate(() => {
            const options = Array.from(document.querySelectorAll('select[name="bean.district"] option'));
            // 排除值为空(请选择)以及被禁用/带有已满字样的选项
            const validOpt = options.find(o => o.value && !o.disabled && !o.text.includes('已滿') && !o.text.includes('已满'));
            return validOpt ? validOpt.value : null;
        });

        if (availableDistrict) {
            console.log(`✅ 找到可用区域并选择: [${availableDistrict}]`);
            await page.selectOption('select[name="bean.district"]', availableDistrict);
        } else {
            console.error("❌ 警告：所有区域均已满！强行使用配置默认值测试...");
            try { await page.selectOption('select[name="bean.district"]', userInfo.district); } catch (e) {}
        }
        
        // 区域改变可能会触发 ajax 请求分行列表，延时等待一下即可
        console.log("⏳ 等待分行数据加载(AJAX)...");
        await page.waitForTimeout(1500); 

        // 同样动态处理[具体分行]选项
        console.log("⏳ 正在寻找未满的具体分行...");
        const availableBranch = await page.evaluate(() => {
            const options = Array.from(document.querySelectorAll('select[name="bean.branchCode"] option'));
            const validOpt = options.find(o => o.value && !o.disabled && !o.text.includes('已滿') && !o.text.includes('已满'));
            return validOpt ? validOpt.value : null;
        });

        if (availableBranch) {
            console.log(`✅ 找到可用分行并选择: [${availableBranch}]`);
            await page.selectOption('select[name="bean.branchCode"]', availableBranch);
        } else {
            console.error("❌ 警告：当前区域下的所有分行可能已满！");
            try { await page.selectOption('select[name="bean.branchCode"]', userInfo.branchCode); } catch (e) {}
        }

        await page.selectOption('select[name="bean.appTime"]', userInfo.appTime);
        */



        // ==========================================
        // 第三步：抓取验证码并请求本地 OCR 服务
        // ==========================================
        console.log("🔍 正在识别验证码...");
        const captchaSelector = '#captcha_img';
        const captchaLocator = page.locator(captchaSelector);
        
        // Playwright 神技：直接对着 DOM 元素截图并返回 Buffer
        const captchaBuffer = await captchaLocator.screenshot();
        const base64Image = captchaBuffer.toString('base64');

        // 发起请求到本地基于 Docker 跑起来的 FastApi
        const response = await fetch("http://172.16.15.227:38080/api/recognize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image_base64: base64Image })
        });
        
        const resData = await response.json();

        if (resData.code === 200 && resData.result) {
            console.log(`🎯 验证码识别成功: [${resData.result}]`);
            // 填入验证码
            await page.fill('input[name="captcha"]', resData.result);
            
            // ==========================================
            // 提交表单 (建议测试时保留注释，跑通后再开启自动提交)
            // ==========================================
            // console.log("🚀 所有资料填写完毕，提交表单...");
            // await page.click('#eAAOForm_submit_button'); 
            
            console.log("🎉 流程执行完毕，保留浏览器供排查检查 5 分钟...");
            await page.waitForTimeout(60000 * 5); // 停留5分钟供肉眼确认，结束后自动关闭
        } else {
            console.error("❌ 验证码识别失败，返回数据:", resData);
        }
    } catch (error) {
        console.error("💥 脚本执行过程中发生错误:", error);
    } finally {
        console.log("清理并关闭浏览器...");
        await browser.close();
    }
})();