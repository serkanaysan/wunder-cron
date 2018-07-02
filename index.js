const axios = require("axios");

const jsdom = require("jsdom");
const { JSDOM } = jsdom;

const fs = require('fs');

const mysql = require('mysql2/promise');
const model = require('./Model/data');

const url = "http://startupstash.com/";

var startupstashDM = new model.StartupStash();

const getDataFromUrlAndSave = async url => {
    try {

        //get category and featured resources html code from url and create dom
        const response = await axios.get(url).catch(err => {
            console.log(err);
            process.exit(1);
        });
        const data = response.data;
        const { document } = (new JSDOM(data)).window;

        //create category array
        var categoriesHTML = Array.from(document.getElementById('categories').getElementsByTagName('li'));

        //insert category to DM
        const categoryPromise = categoriesHTML.map(async (category, i) => {
            var categoryDM = new model.Category()
            categoryDM.title = category.getElementsByTagName('a').item(0).title;
            categoryDM.url = category.getElementsByTagName('a').item(0).href;
            categoryDM.queue = i;
            categoryDM.alias = categoryDM.title.toString().toLowerCase().replace(/ /g, '').replace(".", "-");
            return categoryDM
        });

        startupstashDM.categories = await Promise.all(categoryPromise);

        //create featured resources array
        var frHTML = Array.from(document.getElementById('featured-and-latest-companies').getElementsByTagName('ul').item(0).getElementsByTagName('li'));

        //insert featured resources to DM
        frHTML.map(fr => {
            if (fr.className != "with-image clone") {
                var featuredresourcesDM = new model.FeaturedResources();
                featuredresourcesDM.title = fr.getElementsByClassName('home-companies-title').item(0).textContent;
                featuredresourcesDM.category = fr.getElementsByClassName('home-companies-categories').item(0).textContent;
                featuredresourcesDM.desc = fr.getElementsByClassName('home-companies-description').item(0).textContent;
                featuredresourcesDM.url = fr.getElementsByClassName('home-companies-more').item(0).getElementsByTagName('a').item(0).href;
                featuredresourcesDM.logoUrl = fr.getElementsByClassName('home-companies-image').item(0).getElementsByTagName('img').item(0).src;
                startupstashDM.featuredresources.push(featuredresourcesDM);
            }
        });

        //get category products and insert to DM
        const categoryProductPromise = startupstashDM.categories.map(async category => {
            //get product html code from url and create dom
            const responseCategory = await axios.get(category.url).catch(err => {
                console.log(err);
                process.exit(1);
            });
            const dataCategory = responseCategory.data;
            const { document } = (new JSDOM(dataCategory)).window;

            //create products array
            const productsHTML = Array.from(document.getElementById("content-center").getElementsByClassName("company-listing with-image"));

            //insert product to category
            const productPromise = productsHTML.map(async (product, i) => {
                var productDM = new model.Product()
                productDM.title = product.getElementsByClassName('company-listing-body').item(0).getElementsByClassName('company-listing-title').item(0).textContent;
                productDM.desc = product.getElementsByClassName('company-listing-body').item(0).getElementsByClassName('company-listing-text').item(0).textContent;
                productDM.url = product.getElementsByClassName('company-listing-body').item(0).getElementsByClassName('company-listing-more').item(0).getElementsByTagName('a').item(0).href;
                productDM.logoUrl = product.getElementsByClassName('company-listing-image').item(0).getElementsByTagName('a').item(0).getElementsByTagName('img').item(0).src;
                productDM.queue = i;
                productDM.alias = productDM.title.toString().toLowerCase().replace(/ /g, '').replace(".", "-");

                const responseProduct = await axios.get(productDM.url).catch(err => {
                    console.log(err);
                    process.exit(1);
                });
                const dataProduct = responseProduct.data;
                const { document } = (new JSDOM(dataProduct)).window;

                productDM.representation = document.getElementsByClassName('company-page-representation').item(0).textContent;
                productDM.posterUrl = document.getElementById('company-page-photo').getElementsByClassName('opacity').item(0).style.backgroundImage.replace(/url/g, "").replace(/[()]/g, "").replace(/\"/g, "");

                const bodyParagraph = Array.from(document.getElementsByClassName('company-page-body').item(0).getElementsByTagName('p'));
                productDM.body = "";
                bodyParagraph.map(p => {
                    productDM.body += p.outerHTML;
                });

                productDM.webUrl = document.getElementsByClassName('company-page-body').item(0).getElementsByTagName('a').item(0).href;

                return productDM
            });

            category.products = await Promise.all(productPromise);
            console.log(category.title);
            return category
        });

        startupstashDM.categories = await Promise.all(categoryProductPromise);


        const productTitles = [];
        const categoryTitles = [];

        startupstashDM.categories.map(category => {
            categoryTitles.push(category.title);
            category.products.map(product => {
                productTitles.push(product.title);
            });
        });

        const featuredTitles = [];
        startupstashDM.featuredresources.map(featured => {
            featuredTitles.push(featured.title);
        });


        // create the connection
        const connection = await mysql.createConnection({ host: '35.234.136.67', user: 'root', password: 'c417d53%!', database: 'wunder' });

        // delete if category or product delete from web site
        await connection.query('update product set featured=false where title not in (?)', [featuredTitles]);
        await connection.query('delete from product where title not in (?)', [productTitles]);
        await connection.query('delete p, c from product as p left join category as c on p.categoryId=c.id where c.title not in (?)', [categoryTitles])
        await connection.query('delete from category where title not in (?)', [categoryTitles]);
        


        //update and insert category and product
        const databaseCategoryProductPromise = startupstashDM.categories.map(async category => {
            var [rows, fields] = await connection.execute('select * from category where title=?', [category.title]);

            if (rows.length == 0) {
                await connection.query("insert into category (title, queue, alias) values (?, ?, ?)", [category.title, category.queue, category.alias]);
            }
            else {
                await connection.query("update category set queue=?, alias=? where title=?", [category.queue, category.alias, category.title]);
            }

            const databaseProductPromise = category.products.map(async product => {
                [rows, fields] = await connection.execute('select id from category where title=?', [category.title]);
                var categoryId = parseInt(rows[0].id);

                [rows, fields] = await connection.execute('select * from product where title=? and featured=false', [product.title]);

                if (rows.length == 0) {
                    await connection.query("insert into product (title, representation, description, body, logoUrl, posterUrl, webUrl, categoryId, queue, alias) values (?, ?, ? ,? ,?, ?, ?, ?, ?, ?)", [product.title, product.representation, product.desc, product.body, product.logoUrl, product.posterUrl, product.webUrl, categoryId, product.queue, product.alias]);
                }
                else {
                    await connection.query("update product set representation=?, description=?, body=?, logoUrl=?, posterUrl=?, webUrl=?, categoryId=?, queue=?, alias=? where title=?", [product.representation, product.desc, product.body, product.logoUrl, product.posterUrl, product.webUrl, categoryId, product.queue, product.alias, product.title]);
                }

                return rows
            });

            await Promise.all(databaseProductPromise);

            return rows;

        });

        await Promise.all(databaseCategoryProductPromise);

        //update featured
        const databaseFeaturedPromise = startupstashDM.featuredresources.map(async featured => {
            var [rows, fields] = await connection.query("update product set featured=true where title=?", [featured.title]);

            return rows
        });

        await Promise.all(databaseFeaturedPromise);

        console.log("completed");
        process.exit(1);
    } catch (error) {
        console.log(error);
        process.exit(1)
    }
};

getDataFromUrlAndSave(url);

//c417d53%!
//Wdr.is%34








