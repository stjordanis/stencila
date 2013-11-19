//! @file html.hpp
//! @brief Classes and functions for working with HTML
//! @author Nokome Bentley

#pragma once

#include <tidy-html5/tidy.h>
#include <tidy-html5/buffio.h>

#include <stencila/xml.hpp>
#include <stencila/exception.hpp>

namespace Stencila {
namespace Html {

typedef Xml::Node Node;
typedef Xml::Attribute Attribute;

static std::string tidy(const std::string& html){
    TidyDoc document = tidyCreate();
    bool ok = tidyOptSetBool(document,TidyXhtmlOut,yes);
    if(ok){
        TidyBuffer error_buffer = {0};
        int rc = tidySetErrorBuffer(document, &error_buffer);
        if(rc >= 0) rc = tidyParseString(document,html.c_str());
        if(rc >= 0) rc = tidyCleanAndRepair(document);
        if(rc >= 0) rc = tidyRunDiagnostics(document);
        if(rc > 1) rc = (tidyOptSetBool(document, TidyForceOutput, yes)?rc:-1);
        
        TidyBuffer output_buffer = {0};
        if(rc>=0) rc = tidySaveBuffer(document, &output_buffer);
        
        std::stringstream output_stream;
        output_stream<<output_buffer.bp;
        std::string output = output_stream.str();
        tidyBufFree(&output_buffer);
        
        std::stringstream error_stream;
        error_stream<<error_buffer.bp;
        std::string error = error_stream.str();
        tidyBufFree(&error_buffer);
        
        tidyRelease(document);
        
        if(rc >= 0){
            //if(rc > 0) std::cout<<error<<"\n";//STENCILA_THROW(Exception,error);
            return output;
        } else {
            STENCILA_THROW(Exception,"A severe error occurred");
        }
    }
    STENCILA_THROW(Exception,"An error occurred");
}

class Document : public Xml::Document {
public:

    Document(void){
    }

    Document(const std::string& html){
        load(tidy(html));
    }
};

}
}
